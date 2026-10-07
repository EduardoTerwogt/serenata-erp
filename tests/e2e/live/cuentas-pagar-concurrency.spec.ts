import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { cleanupLiveCuentasByPrefix, getLiveSupabaseAdmin, insertarCuentaPagarConRenglon, aprobarFixture } from '../utils/live-cleanup'

/**
 * Prueba de concurrencia real contra serenata-erp-test para el RPC
 * registrar_pago_proveedor (#123: una cabecera `pagos` con una línea por grupo, locks en el orden global de T16). Mismo
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

/** Pago a uno o varios grupos del mismo proveedor (el monto es el total a transferir de cada línea). */
function pagarGrupos(supabase: Supabase, items: [string, number][], operationId?: string) {
  return supabase.rpc('registrar_pago_proveedor', {
    p_lineas: items.map(([grupo_id, monto]) => ({ grupo_id, monto })),
    p_tipo_pago: 'TRANSFERENCIA',
    p_fecha_pago: '2026-09-05',
    p_operation_id: operationId ?? null,
  })
}

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
    estado: 'EMITIDA',
  }))
  ok(await supabase.from('proyectos').insert({ id: proyectoId, proyecto: `${prefix} Proyecto` }))
  const grupoId = randomUUID()
  ok(await supabase.from('cuentas_pagar_grupos').insert({
    id: grupoId,
    proyecto_id: proyectoId,
    responsable_id: proveedorId,
    estado: 'FACTURADO',
  }))
  await insertarCuentaPagarConRenglon(supabase, {
    cotizacionId: proyectoId,
    proyectoId,
    responsableId: proveedorId,
    grupoId,
    xPagar,
    descripcion: `Renglón ${proyectoId}`,
  })
  await aprobarFixture(supabase, proyectoId)
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

test.describe('live: concurrencia en registrar_pago_proveedor', () => {
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
        pagarGrupos(supabase, [[grupoId, 580]]),
        pagarGrupos(supabase, [[grupoId, 580]]),
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
        pagarGrupos(supabase, [[grupoId, 800]]),
        pagarGrupos(supabase, [[grupoId, 800]]),
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
        pagarGrupos(supabase, [[grupoAId, 580]]),
        pagarGrupos(supabase, [[grupoBId, 1160]]),
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
  test('doble clic: el mismo operation_id registra un solo pago a proveedor', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}${randomUUID().slice(0, 6).toUpperCase()}`
    const proveedorId = await crearProveedor(supabase, prefix)
    const grupoId = await crearGrupoDePrueba(supabase, prefix, proveedorId, 1000)
    const operationId = randomUUID()

    try {
      const [r1, r2] = await Promise.all([pagarGrupos(supabase, [[grupoId, 500]], operationId), pagarGrupos(supabase, [[grupoId, 500]], operationId)])
      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()
      expect((r1.data as { pago_id: string }).pago_id).toBe((r2.data as { pago_id: string }).pago_id)

      const { data: pagos } = await supabase.from('pagos_cuentas_pagar').select('id').eq('grupo_id', grupoId)
      expect(pagos).toHaveLength(1)
      const { data: grupo } = await supabase.from('cuentas_pagar_grupos').select('monto_transferido').eq('id', grupoId).single()
      expect(Number(grupo?.monto_transferido)).toBe(500)
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('un pago a dos grupos del mismo proveedor es una cabecera con dos líneas y es atómico', async () => {
    const supabase = getLiveSupabaseAdmin()
    const prefix = `${PREFIJO}${randomUUID().slice(0, 6).toUpperCase()}`
    const proveedorId = await crearProveedor(supabase, prefix)
    const grupoAId = await crearGrupoDePrueba(supabase, prefix, proveedorId, 500)
    const grupoBId = await crearGrupoDePrueba(supabase, prefix, proveedorId, 1000)

    try {
      // Una línea excede su saldo: no se aplica ninguna.
      const malo = await pagarGrupos(supabase, [[grupoAId, 580], [grupoBId, 2000]])
      expect(malo.error?.message ?? '').toMatch(/excede el total a transferir/i)
      const { data: ninguno } = await supabase.from('pagos_cuentas_pagar').select('id').in('grupo_id', [grupoAId, grupoBId])
      expect(ninguno).toHaveLength(0)

      const bueno = await pagarGrupos(supabase, [[grupoAId, 580], [grupoBId, 1160]])
      expect(bueno.error).toBeNull()
      const { data: lineas } = await supabase.from('pagos_cuentas_pagar').select('pago_id').in('grupo_id', [grupoAId, grupoBId])
      expect(lineas).toHaveLength(2)
      expect(new Set((lineas ?? []).map((l) => l.pago_id)).size).toBe(1)
      const { data: grupos } = await supabase.from('cuentas_pagar_grupos').select('estado').in('id', [grupoAId, grupoBId])
      expect((grupos ?? []).map((g) => g.estado)).toEqual(['PAGADO', 'PAGADO'])
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })

  test('pagar contra cancelar la orden a la vez no se bloquea (ABBA cerrado, T16): una de las dos gana y queda consistente', async () => {
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

      const [pago, cancela] = await Promise.all([
        pagarGrupos(supabase, [[grupoAId, 580], [grupoBId, 1160]]),
        supabase.rpc('cancelar_orden_pago', { p_orden_id: ordenId, p_motivo: 'live', p_usuario: 'live' }),
      ])
      // Antes del orden global de locks esto podía terminar en deadlock (40P01) para una de las dos.
      for (const r of [pago, cancela]) expect(r.error?.code ?? '').not.toBe('40P01')
      expect([pago, cancela].filter((r) => !r.error).length).toBeGreaterThanOrEqual(1)

      const { data: ordenFinal } = await supabase.from('ordenes_pago').select('estado').eq('id', ordenId).single()
      // Gana la cancelación (la orden queda CANCELADA y el pago, sin orden, también procede) o gana el pago (la
      // orden se completa y la cancelación se rechaza con orden_con_pagos): nunca un estado intermedio.
      if (!cancela.error) expect(ordenFinal?.estado).toBe('CANCELADA')
      else expect(ordenFinal?.estado).toBe('COMPLETADA')
      if (cancela.error) expect(cancela.error.message).toMatch(/orden_con_pagos/)
    } finally {
      await cleanupLiveCuentasByPrefix(prefix)
    }
  })
})
