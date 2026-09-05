import { test, expect } from '@playwright/test'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Prueba de concurrencia real contra serenata-erp-test para el RPC
 * registrar_pago_cuenta_cobrar (SELECT ... FOR UPDATE, migracion
 * 20260420_atomic_registrar_pago.sql). No pasa por el navegador ni por la
 * ruta HTTP de Next.js -- llama al RPC directo via supabase-js, igual que
 * tests/e2e/utils/live-cleanup.ts, para poder disparar dos requests
 * realmente simultaneos con Promise.all.
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

async function crearCuentaCobrarDePrueba(supabase: ReturnType<typeof getLiveSupabaseAdmin>, montoTotal: number) {
  const { data, error } = await supabase
    .from('cuentas_cobrar')
    .insert({ cliente: 'E2E-CONCURRENCY-TEST', proyecto: 'Test concurrencia pagos', monto_total: montoTotal })
    .select()
    .single()
  if (error) throw error
  return data.id as string
}

async function limpiarCuentaCobrarDePrueba(supabase: ReturnType<typeof getLiveSupabaseAdmin>, cuentaId: string) {
  await supabase.from('pagos_comprobantes').delete().eq('cuentas_cobrar_id', cuentaId)
  await supabase.from('cuentas_cobrar').delete().eq('id', cuentaId)
}

test.describe('live: concurrencia en registrar_pago_cuenta_cobrar', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('dos pagos simultaneos que juntos completan el total no pierden ninguno', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuentaCobrarDePrueba(supabase, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_cobrar', {
          p_cuenta_id: cuentaId,
          p_monto: 500,
          p_tipo_pago: 'TRANSFERENCIA',
          p_fecha_pago: '2026-09-05',
        }),
        supabase.rpc('registrar_pago_cuenta_cobrar', {
          p_cuenta_id: cuentaId,
          p_monto: 500,
          p_tipo_pago: 'TRANSFERENCIA',
          p_fecha_pago: '2026-09-05',
        }),
      ])

      expect(r1.error).toBeNull()
      expect(r2.error).toBeNull()

      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_cobrar')
        .select('monto_pagado, estado')
        .eq('id', cuentaId)
        .single()
      if (cuentaError) throw cuentaError

      expect(Number(cuenta.monto_pagado)).toBe(1000)
      expect(cuenta.estado).toBe('PAGADO')

      const { data: pagos, error: pagosError } = await supabase
        .from('pagos_comprobantes')
        .select('id, monto')
        .eq('cuentas_cobrar_id', cuentaId)
      if (pagosError) throw pagosError

      expect(pagos).toHaveLength(2)
    } finally {
      await limpiarCuentaCobrarDePrueba(supabase, cuentaId)
    }
  })

  test('dos pagos simultaneos que juntos exceden el total: exactamente uno se rechaza', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cuentaId = await crearCuentaCobrarDePrueba(supabase, 1000)

    try {
      const [r1, r2] = await Promise.all([
        supabase.rpc('registrar_pago_cuenta_cobrar', {
          p_cuenta_id: cuentaId,
          p_monto: 700,
          p_tipo_pago: 'TRANSFERENCIA',
          p_fecha_pago: '2026-09-05',
        }),
        supabase.rpc('registrar_pago_cuenta_cobrar', {
          p_cuenta_id: cuentaId,
          p_monto: 700,
          p_tipo_pago: 'TRANSFERENCIA',
          p_fecha_pago: '2026-09-05',
        }),
      ])

      const resultados = [r1, r2]
      const exitosos = resultados.filter(r => !r.error)
      const fallidos = resultados.filter(r => r.error)

      // Si el lock no funcionara, ambos podrian tener exito (sobrepago silencioso).
      expect(exitosos).toHaveLength(1)
      expect(fallidos).toHaveLength(1)
      expect(fallidos[0].error?.message ?? '').toMatch(/excede el total/i)

      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_cobrar')
        .select('monto_pagado')
        .eq('id', cuentaId)
        .single()
      if (cuentaError) throw cuentaError

      expect(Number(cuenta.monto_pagado)).toBe(700)
    } finally {
      await limpiarCuentaCobrarDePrueba(supabase, cuentaId)
    }
  })
})
