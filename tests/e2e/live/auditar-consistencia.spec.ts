import { test, expect } from '@playwright/test'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'
import { liveEnabled } from '../utils/live-helpers'

/**
 * B7 (F9): `auditar_consistencia()` existe en la BD de test con permiso para
 * `service_role` (la app la llama así) y devuelve el contrato de
 * `lib/shared/auditoria.ts`. Solo verifica la FORMA, no que dé 0: los restos de
 * otros specs `live` podrían dejar filas inconsistentes y volver este test
 * intermitente; el conteo real lo ve Admin y lo registra el cron diario.
 */
test.describe('live: auditar_consistencia()', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('responde con el contrato esperado', async () => {
    const supabase = getLiveSupabaseAdmin()
    const { data, error } = await supabase.rpc('auditar_consistencia')
    expect(error).toBeNull()

    const r = data as { ejecutado_en: string; total_violaciones: number; guardas: { clave: string; descripcion: string; violaciones: number; ejemplos: string[] }[] }
    expect(typeof r.ejecutado_en).toBe('string')
    expect(typeof r.total_violaciones).toBe('number')
    expect(r.guardas.length).toBeGreaterThanOrEqual(27)
    // #123: las seis guardas del modelo de facturas y pagos ligados.
    const claves = r.guardas.map((g) => g.clave)
    for (const k of ['factura_ligada', 'factura_cliente', 'factura_suma', 'pago_coherente', 'complemento_valido', 'factura_fecha']) {
      expect(claves).toContain(k)
    }
    // #110 B2: las tres guardas del histórico de Cuentas.
    for (const k of ['historico_modificado', 'historico_reabierto', 'componente_mixto']) {
      expect(claves).toContain(k)
    }
    for (const g of r.guardas) {
      expect(typeof g.clave).toBe('string')
      expect(typeof g.descripcion).toBe('string')
      expect(Number.isInteger(g.violaciones)).toBe(true)
      expect(Array.isArray(g.ejemplos)).toBe(true)
      expect(g.ejemplos.length).toBeLessThanOrEqual(5)
    }
    expect(r.total_violaciones).toBe(r.guardas.reduce((n, g) => n + g.violaciones, 0))
    console.log(`[auditar_consistencia] test: ${r.total_violaciones} violación(es) en ${r.guardas.length} guardas`)
  })
})
