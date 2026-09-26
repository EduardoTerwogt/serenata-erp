import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Prueba de concurrencia real contra serenata-erp-test para el RPC
 * registrar_pago_cuenta_pagar (SELECT ... FOR UPDATE). Mismo patron que
 * tests/e2e/live/cuentas-cobrar-concurrency.spec.ts: llama al RPC directo
 * via supabase-js (sin navegador) para disparar dos requests realmente
 * simultaneos con Promise.all. Cubre ademas el recalculo atomico de
 * ordenes_pago.estado cuando dos cuentas de la MISMA orden se pagan casi al
 * mismo tiempo.
 *
 * Rediseño de Cuentas B2 (docs/PLAN.md, D3): el monto es el TOTAL A
 * TRANSFERIR. Cada suelta lleva proveedor (T2), factura XML validada (D25) y
 * snapshot total_a_transferir (T4); la conversión a neto la hace la RPC.
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

type Supabase = ReturnType<typeof getLiveSupabaseAdmin>

function ok(result: { error: unknown }) {
  if (result.error) throw result.error
}

async function crearProveedor(supabase: Supabase) {
  const id = randomUUID()
  ok(await supabase.from('proveedores').insert({ id, nombre: `E2E-CONCURRENCY-${id.slice(0, 6)}`, activo: true }))
  return id
}

/** Suelta con factura validada: neto `xPagar`, total a transferir = neto × 1.16 (persona moral). */
async function crearCuentaPagarDePrueba(supabase: Supabase, proveedorId: string, xPagar: number) {
  const totalATransferir = Math.round(xPagar * 116) / 100
  const { data, error } = await supabase
    .from('cuentas_pagar')
    .insert({
      responsable_id: proveedorId,
      responsable_nombre: 'E2E-CONCURRENCY-TEST',
      x_pagar: xPagar,
      total_a_transferir: totalATransferir,
      estado: 'PENDIENTE',
    })
    .select()
    .single()
  if (error) throw error
  ok(await supabase.from('documentos_cuentas_pagar').insert({
    cuentas_pagar_id: data.id,
    tipo: 'FACTURA_PROVEEDOR_XML',
    archivo_url: 'https://example.com/live.xml',
    archivo_nombre: 'live.xml',
    estado_validacion: 'validado',
    total_cfdi: totalATransferir,
  }))
  return data.id as string
}

async function limpiar(supabase: Supabase, proveedorId: string, cuentaIds: string[], ordenIds: string[] = []) {
  if (ordenIds.length) await supabase.from('ordenes_pago_conceptos').delete().in('orden_pago_id', ordenIds)
  await supabase.from('pagos_cuentas_pagar').delete().in('cuenta_pagar_id', cuentaIds)
  await supabase.from('documentos_cuentas_pagar').delete().in('cuentas_pagar_id', cuentaIds)
  await supabase.from('cuentas_pagar').delete().in('id', cuentaIds)
  if (ordenIds.length) await supabase.from('ordenes_pago').delete().in('id', ordenIds)
  await supabase.from('proveedores').delete().eq('id', proveedorId)
}

test.describe('live: concurrencia en registrar_pago_cuenta_pagar', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('dos pagos simultaneos que juntos completan el total no pierden ninguno y cierran al centavo', async () => {
    const supabase = getLiveSupabaseAdmin()
    const proveedorId = await crearProveedor(supabase)
    const cuentaId = await crearCuentaPagarDePrueba(supabase, proveedorId, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 580 }),
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 580 }),
      ])

      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_pagar')
        .select('monto_pagado, monto_transferido, estado')
        .eq('id', cuentaId)
        .single()
      if (cuentaError) throw cuentaError

      expect(Number(cuenta.monto_transferido)).toBe(1160)
      // Regla del último pago (H8): el neto cierra exacto, sin residuo.
      expect(Number(cuenta.monto_pagado)).toBe(1000)
      expect(cuenta.estado).toBe('PAGADO')

      // Cuadre: Σ neto de los pagos = neto de la cuenta, al centavo.
      const { data: pagos } = await supabase.from('pagos_cuentas_pagar').select('monto_neto, monto_transferido').eq('cuenta_pagar_id', cuentaId)
      expect((pagos ?? []).reduce((s, p) => s + Number(p.monto_neto), 0)).toBeCloseTo(1000, 2)
      expect((pagos ?? []).reduce((s, p) => s + Number(p.monto_transferido), 0)).toBeCloseTo(1160, 2)
    } finally {
      await limpiar(supabase, proveedorId, [cuentaId])
    }
  })

  test('dos pagos simultaneos que juntos exceden el total: exactamente uno se rechaza', async () => {
    const supabase = getLiveSupabaseAdmin()
    const proveedorId = await crearProveedor(supabase)
    const cuentaId = await crearCuentaPagarDePrueba(supabase, proveedorId, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 800 }),
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 800 }),
      ])

      const resultados = [r1, r2]
      const exitosos = resultados.filter(r => !r.error)
      const fallidos = resultados.filter(r => r.error)

      expect(exitosos).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/excede el total a transferir/i)

      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_pagar')
        .select('monto_pagado, monto_transferido')
        .eq('id', cuentaId)
        .single()
      if (cuentaError) throw cuentaError

      expect(Number(cuenta.monto_transferido)).toBe(800)
      expect(Number(cuenta.monto_pagado)).toBe(689.66) // 800 × 1000 / 1160
    } finally {
      await limpiar(supabase, proveedorId, [cuentaId])
    }
  })

  test('dos cuentas de la misma orden pagadas simultaneamente dejan la orden en COMPLETADA sin carreras', async () => {
    const supabase = getLiveSupabaseAdmin()
    const proveedorId = await crearProveedor(supabase)
    const cuentaAId = await crearCuentaPagarDePrueba(supabase, proveedorId, 500)
    const cuentaBId = await crearCuentaPagarDePrueba(supabase, proveedorId, 1000)
    const ordenIds: string[] = []

    try {
      const { data: orden, error: ordenError } = await supabase.rpc('generar_orden_pago', {
        p_candidatos: [
          { tipo: 'cuenta', id: cuentaAId, monto_esperado: 500 },
          { tipo: 'cuenta', id: cuentaBId, monto_esperado: 1000 },
        ],
        p_pdf_url: null,
        p_pdf_nombre: 'E2E-CONCURRENCY.pdf',
        p_usuario: 'live',
      })
      if (ordenError) throw ordenError
      const ordenId = (orden as { orden_pago_id: string }).orden_pago_id
      ordenIds.push(ordenId)

      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaAId, p_monto: 580 }),
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaBId, p_monto: 1160 }),
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
      await limpiar(supabase, proveedorId, [cuentaAId, cuentaBId], ordenIds)
    }
  })
})
