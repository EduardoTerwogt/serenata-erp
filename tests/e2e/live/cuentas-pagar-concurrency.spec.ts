import { test, expect } from '@playwright/test'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Prueba de concurrencia real contra serenata-erp-test para el RPC
 * registrar_pago_cuenta_pagar (SELECT ... FOR UPDATE, migracion
 * 20260905_atomic_registrar_pago_cuenta_pagar.sql). Mismo patron que
 * tests/e2e/live/cuentas-cobrar-concurrency.spec.ts: llama al RPC directo
 * via supabase-js (sin navegador) para disparar dos requests realmente
 * simultaneos con Promise.all. Cubre ademas el caso que cuentas_cobrar no
 * tiene: el recalculo atomico de ordenes_pago.estado cuando dos cuentas de
 * la MISMA orden se pagan casi al mismo tiempo.
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

async function crearCuentaPagarDePrueba(supabase: ReturnType<typeof getLiveSupabaseAdmin>, xPagar: number, ordenPagoId?: string) {
  const { data, error } = await supabase
    .from('cuentas_pagar')
    .insert({
      responsable_nombre: 'E2E-CONCURRENCY-TEST',
      x_pagar: xPagar,
      orden_pago_id: ordenPagoId ?? null,
      estado: ordenPagoId ? 'EN_PROCESO_PAGO' : 'PENDIENTE',
    })
    .select()
    .single()
  if (error) throw error
  return data.id as string
}

async function limpiarCuentasPagarDePrueba(supabase: ReturnType<typeof getLiveSupabaseAdmin>, cuentaIds: string[]) {
  await supabase.from('cuentas_pagar').delete().in('id', cuentaIds)
}

test.describe('live: concurrencia en registrar_pago_cuenta_pagar', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('dos pagos simultaneos que juntos completan el total no pierden ninguno', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuentaPagarDePrueba(supabase, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 500 }),
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 500 }),
      ])

      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_pagar')
        .select('monto_pagado, estado')
        .eq('id', cuentaId)
        .single()
      if (cuentaError) throw cuentaError

      expect(Number(cuenta.monto_pagado)).toBe(1000)
      expect(cuenta.estado).toBe('PAGADO')
    } finally {
      await limpiarCuentasPagarDePrueba(supabase, [cuentaId])
    }
  })

  test('dos pagos simultaneos que juntos exceden el total: exactamente uno se rechaza', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuentaPagarDePrueba(supabase, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 700 }),
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaId, p_monto: 700 }),
      ])

      const resultados = [r1, r2]
      const exitosos = resultados.filter(r => !r.error)
      const fallidos = resultados.filter(r => r.error)

      expect(exitosos).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/excede el total/i)

      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_pagar')
        .select('monto_pagado')
        .eq('id', cuentaId)
        .single()
      if (cuentaError) throw cuentaError

      expect(Number(cuenta.monto_pagado)).toBe(700)
    } finally {
      await limpiarCuentasPagarDePrueba(supabase, [cuentaId])
    }
  })

  test('dos cuentas de la misma orden pagadas simultaneamente dejan la orden en COMPLETADA sin carreras', async () => {
    const supabase = getLiveSupabaseAdmin()
    const { data: orden, error: ordenError } = await supabase
      .from('ordenes_pago')
      .insert({ fecha_generacion: new Date().toISOString().split('T')[0], estado: 'GENERADA', total_monto: 1500 })
      .select()
      .single()
    if (ordenError) throw ordenError
    const ordenId = orden.id as string

    const cuentaAId = await crearCuentaPagarDePrueba(supabase, 500, ordenId)
    const cuentaBId = await crearCuentaPagarDePrueba(supabase, 1000, ordenId)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaAId, p_monto: 500 }),
        supabase.rpc('registrar_pago_cuenta_pagar', { p_cuenta_id: cuentaBId, p_monto: 1000 }),
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
      expect(ordenActualizada.estado).toBe('COMPLETADA')
    } finally {
      await limpiarCuentasPagarDePrueba(supabase, [cuentaAId, cuentaBId])
      await supabase.from('ordenes_pago').delete().eq('id', ordenId)
    }
  })
})
