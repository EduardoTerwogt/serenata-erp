import { test, expect } from '@playwright/test'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * Prueba de integridad real contra serenata-erp-test para la RPC
 * upsert_items_cotizacion (db/migrations/20260910_upsert_items_cotizacion_guarded.sql).
 * No pasa por el navegador -- llama la RPC directo via supabase-js, igual que
 * las pruebas de concurrencia de cuentas.
 *
 * Fase 8 (hardening pre-Proyectos): las partidas nacen con UUID generado en el
 * CLIENTE. Antes de esta RPC, `upsertItems()` hacía un `.upsert()` genérico sin
 * ningún WHERE en el ON CONFLICT -- un UUID reusado deliberadamente (o por un
 * bug futuro) que ya perteneciera a OTRA cotización podía "secuestrar" esa fila
 * ajena, sobreescribiéndola por completo. Esta prueba confirma que la RPC
 * rechaza esa operación (no la aplica) sin tocar la fila ajena.
 */

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

async function crearCotizacionDePrueba(supabase: ReturnType<typeof getLiveSupabaseAdmin>, id: string) {
  const { error } = await supabase.from('cotizaciones').insert({ id, cliente: 'E2E-UUID-GUARD', proyecto: 'Test guardia de UUID', estado: 'BORRADOR' })
  if (error) throw error
}

async function limpiarCotizacionDePrueba(supabase: ReturnType<typeof getLiveSupabaseAdmin>, id: string) {
  await supabase.from('items_cotizacion').delete().eq('cotizacion_id', id)
  await supabase.from('cotizaciones').delete().eq('id', id)
}

test.describe('live: guardia de UUID cruzado en items_cotizacion', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('un UUID reusado de otra cotización no secuestra la fila ajena', async () => {
    const supabase = getLiveSupabaseAdmin()
    const cotizacionAId = `SH-E2E-UUID-GUARD-A-${Date.now()}`
    const cotizacionBId = `SH-E2E-UUID-GUARD-B-${Date.now()}`

    await crearCotizacionDePrueba(supabase, cotizacionAId)
    await crearCotizacionDePrueba(supabase, cotizacionBId)

    try {
      // A crea su partida legítima.
      const { data: itemsA, error: errorA } = await supabase.rpc('upsert_items_cotizacion', {
        p_cotizacion_id: cotizacionAId,
        p_items: [{ descripcion: 'Item legítimo de A', precio_unitario: 1000 }],
      })
      expect(errorA).toBeNull()
      const itemId = itemsA![0].id as string

      // B intenta "crear" una partida reusando el mismo UUID -- si el guard
      // funciona, esto no debe tocar la fila de A en absoluto.
      const { data: itemsB, error: errorB } = await supabase.rpc('upsert_items_cotizacion', {
        p_cotizacion_id: cotizacionBId,
        p_items: [{ id: itemId, descripcion: 'Secuestrado por B', precio_unitario: 9999 }],
      })
      expect(errorB).toBeNull()
      // La fila de A no le pertenece a B: la RPC no la devuelve (RETURNING la
      // omite cuando el WHERE del ON CONFLICT falla).
      expect(itemsB).toEqual([])

      const { data: itemFinal, error: errorFinal } = await supabase
        .from('items_cotizacion')
        .select('cotizacion_id, descripcion, precio_unitario')
        .eq('id', itemId)
        .single()
      expect(errorFinal).toBeNull()
      expect(itemFinal).toEqual({
        cotizacion_id: cotizacionAId,
        descripcion: 'Item legítimo de A',
        precio_unitario: 1000,
      })
    } finally {
      await limpiarCotizacionDePrueba(supabase, cotizacionAId)
      await limpiarCotizacionDePrueba(supabase, cotizacionBId)
    }
  })
})
