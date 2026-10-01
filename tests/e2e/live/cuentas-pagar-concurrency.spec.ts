import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { cleanupLiveCuentasByPrefix, getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Prueba de concurrencia real contra serenata-erp-test para el RPC
 * registrar_pago_grupo_factura (SELECT ... FOR UPDATE sobre el grupo). Mismo
 * patron que tests/e2e/live/cuentas-cobrar-concurrency.spec.ts: llama al RPC
 * directo via supabase-js (sin navegador) para disparar dos requests realmente
 * simultaneos con Promise.all. Cubre ademas el recalculo atomico de
 * ordenes_pago.estado cuando dos grupos de la MISMA orden se pagan casi al
 * mismo tiempo.
 *
 * Rediseño de Cuentas B2 (docs/PLAN.md, D3): el monto es el TOTAL A
 * TRANSFERIR. Cada grupo lleva proveedor (T2), factura XML validada (D25) y
 * snapshot total_a_transferir (T4); la conversión a neto la hace la RPC.
 * B5a: los pagos a proveedor son solo por grupo (el pago a una suelta se retiró).
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

const PREFIJO = 'LCON'

type Supabase = ReturnType<typeof getLiveSupabaseAdmin>

function ok(result: { error: unknown }) {
  if (result.error) throw result.error
}

async function crearProveedor(supabase: Supabase, prefix: string) {
  const id = randomUUID()
  ok(await supabase.from('proveedores').insert({ id, nombre: `${prefix} Proveedor`, activo: true }))
  return id
}

/** Grupo FACTURADO con una hija (neto `xPagar`) y factura validada; total a transferir = neto × 1.16 (persona moral). */
async function crearGrupoDePrueba(supabase: Supabase, prefix: string, proveedorId: string, xPagar: number) {
  const totalATransferir = Math.round(xPagar * 116) / 100
  const proyectoId = `${prefix}-${randomUUID().slice(0, 4).toUpperCase()}`
  ok(await supabase.from('cotizaciones').insert({
    id: proyectoId,
    cliente: `${prefix} Cliente`,
    proyecto: `${prefix} Proyecto`,
    fecha_entrega: '2026-01-10',
    tipo: 'PRINCIPAL',
    estado: 'APROBADA',
  }))
  ok(await supabase.from('proyectos').insert({ id: proyectoId, cliente: `${prefix} Cliente`, proyecto: `${prefix} Proyecto` }))
  const grupoId = randomUUID()
  ok(await supabase.from('cuentas_pagar_grupos').insert({
    id: grupoId,
    proyecto_id: proyectoId,
    responsable_id: proveedorId,
    estado: 'FACTURADO',
  }))
  ok(await supabase.from('cuentas_pagar').insert({
    cotizacion_id: proyectoId,
    proyecto_id: proyectoId,
    responsable_id: proveedorId,
    responsable_nombre: `${prefix} Proveedor`,
    item_descripcion: `Renglón ${proyectoId}`,
    x_pagar: xPagar,
    grupo_id: grupoId,
  }))
  ok(await supabase.from('cuentas_pagar_grupos').update({ monto_total: xPagar, total_a_transferir: totalATransferir }).eq('id', grupoId))
  ok(await supabase.from('documentos_cuentas_pagar').insert({
    grupo_id: grupoId,
    tipo: 'FACTURA_PROVEEDOR_XML',
    archivo_url: 'https://example.com/live.xml',
    archivo_nombre: 'live.xml',
    estado_validacion: 'validado',
    total_cfdi: totalATransferir,
  }))
  return grupoId
}

test.describe('live: concurrencia en registrar_pago_grupo_factura', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  // Restos de corridas anteriores (timeout, proceso matado): rompen las guardas de consistencia.
  test.beforeAll(async () => {
    await cleanupLiveCuentasByPrefix(PREFIJO)
  })

  test('dos pagos simultaneos que juntos completan el total no pierden ninguno y cierran al centavo', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}${randomUUID().slice(0, 6).toUpperCase()}`
    const proveedorId = await crearProveedor(supabase, prefix)
    const grupoId = await crearGrupoDePrueba(supabase, prefix, proveedorId, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_grupo_factura', { p_grupo_id: grupoId, p_monto: 580 }),
        supabase.rpc('registrar_pago_grupo_factura', { p_grupo_id: grupoId, p_monto: 580 }),
      ])

      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      const { data: grupo, error: grupoError } = await supabase
        .from('cuentas_pagar_grupos')
        .select('monto_pagado, monto_transferido, estado')
        .eq('id', grupoId)
        .single()
      if (grupoError) throw grupoError

      expect(Number(grupo.monto_transferido)).toBe(1160)
      // Regla del último pago (H8): el neto cierra exacto, sin residuo.
      expect(Number(grupo.monto_pagado)).toBe(1000)
      expect(grupo.estado).toBe('PAGADO')

      const { data: hijas } = await supabase.from('cuentas_pagar').select('monto_pagado, estado').eq('grupo_id', grupoId)
      expect(hijas).toEqual([{ monto_pagado: 1000, estado: 'PAGADO' }])

      // Cuadre: Σ neto de los pagos = neto del grupo, al centavo.
      const { data: pagos } = await supabase.from('pagos_cuentas_pagar').select('monto_neto, monto_transferido').eq('grupo_id', grupoId)
      expect((pagos ?? []).reduce((s, p) => s + Number(p.monto_neto), 0)).toBeCloseTo(1000, 2)
      expect((pagos ?? []).reduce((s, p) => s + Number(p.monto_transferido), 0)).toBeCloseTo(1160, 2)
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('dos pagos simultaneos que juntos exceden el total: exactamente uno se rechaza', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}${randomUUID().slice(0, 6).toUpperCase()}`
    const proveedorId = await crearProveedor(supabase, prefix)
    const grupoId = await crearGrupoDePrueba(supabase, prefix, proveedorId, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_grupo_factura', { p_grupo_id: grupoId, p_monto: 800 }),
        supabase.rpc('registrar_pago_grupo_factura', { p_grupo_id: grupoId, p_monto: 800 }),
      ])

      const resultados = [r1, r2]
      const exitosos = resultados.filter(r => !r.error)
      const fallidos = resultados.filter(r => r.error)

      expect(exitosos).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/excede el total a transferir/i)

      const { data: grupo, error: grupoError } = await supabase
        .from('cuentas_pagar_grupos')
        .select('monto_pagado, monto_transferido')
        .eq('id', grupoId)
        .single()
      if (grupoError) throw grupoError

      expect(Number(grupo.monto_transferido)).toBe(800)
      expect(Number(grupo.monto_pagado)).toBe(689.66) // 800 × 1000 / 1160
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('dos grupos de la misma orden pagados simultaneamente dejan la orden en COMPLETADA sin carreras', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}${randomUUID().slice(0, 6).toUpperCase()}`
    const proveedorId = await crearProveedor(supabase, prefix)
    const grupoAId = await crearGrupoDePrueba(supabase, prefix, proveedorId, 500)
    const grupoBId = await crearGrupoDePrueba(supabase, prefix, proveedorId, 1000)

    try {
      const { data: orden, error: ordenError } = await supabase.rpc('generar_orden_pago', {
        p_candidatos: [
          { tipo: 'grupo', id: grupoAId, monto_esperado: 500 },
          { tipo: 'grupo', id: grupoBId, monto_esperado: 1000 },
        ],
        p_pdf_url: null,
        p_pdf_nombre: `${prefix}.pdf`,
        p_usuario: 'live',
      })
      if (ordenError) throw ordenError
      const ordenId = (orden as { orden_pago_id: string }).orden_pago_id

      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_grupo_factura', { p_grupo_id: grupoAId, p_monto: 580 }),
        supabase.rpc('registrar_pago_grupo_factura', { p_grupo_id: grupoBId, p_monto: 1160 }),
      ])

      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      const { data: ordenActualizada, error: ordenFetchError } = await supabase
        .from('ordenes_pago')
        .select('estado')
        .eq('id', ordenId)
        .single()
      if (ordenFetchError) throw ordenFetchError

      // Si el lock sobre ordenes_pago no funcionara, una de las dos escrituras
      // del estado agregado podria perderse y quedar en PARCIALMENTE_PAGADA.
      // B2 (R6, S1): el estado sale de Σ transferido frente a Σ transferir_cubierto.
      expect(ordenActualizada.estado).toBe('COMPLETADA')
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })
})
