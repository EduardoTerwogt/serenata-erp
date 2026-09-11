import { test, expect, Page } from '@playwright/test'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'
import { login } from '../utils/auth'

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

/**
 * Fase 8.7 (Bloque 4): la RPC ya protege la integridad de la DB (test de arriba),
 * pero la API (`POST /api/cotizaciones/:id/items`) no distinguía ese rechazo de un
 * alta normal -- devolvía 200 con un `item` inexistente. Este test ejercita la ruta
 * real (no la RPC directo) para confirmar la semántica que pide la doc: UUID
 * existente en otra cotización -> 409, sin tocar la fila ajena.
 */
async function crearCotizacionViaApi(page: Page, cliente: string): Promise<{ id: string }> {
  const response = await page.request.post('/api/cotizaciones', {
    data: { cliente, proyecto: 'Test guardia de UUID (API)', estado: 'BORRADOR', items: [] },
  })
  expect(response.status(), `no se pudo crear la cotización de prueba: ${await response.text()}`).toBe(201)
  return response.json() as Promise<{ id: string }>
}

test.describe('live: guardia de UUID cruzado en la API de items', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('crear un item en B con el id de un item de A responde 409 y no toca la fila de A', async ({ page }) => {
    const supabase = getLiveSupabaseAdmin()
    await login(page, '/cotizaciones')

    const suffix = Date.now()
    const cotizacionA = await crearCotizacionViaApi(page, `E2E-UUID-GUARD-API-A-${suffix}`)
    const cotizacionB = await crearCotizacionViaApi(page, `E2E-UUID-GUARD-API-B-${suffix}`)

    try {
      // A crea su partida legítima a través de la ruta real (sin "id" en el body:
      // el servidor genera el suyo, igual que hace el botón "Agregar fila").
      const responseA = await page.request.post(`/api/cotizaciones/${cotizacionA.id}/items`, { data: {} })
      expect(responseA.status(), `no se pudo crear la partida de A: ${await responseA.text()}`).toBe(200)
      const { item: itemA } = await responseA.json() as { item: { id: string } }

      // B intenta "crear" una partida reusando el id de A -- la API debe rechazarlo
      // explícitamente, no devolver éxito con un item inexistente.
      const responseB = await page.request.post(`/api/cotizaciones/${cotizacionB.id}/items`, { data: { id: itemA.id } })
      expect(responseB.status(), `debía responder 409, respondió: ${responseB.status()} ${await responseB.text()}`).toBe(409)

      const { data: itemFinal, error } = await supabase
        .from('items_cotizacion')
        .select('cotizacion_id')
        .eq('id', itemA.id)
        .single()
      expect(error).toBeNull()
      expect(itemFinal?.cotizacion_id).toBe(cotizacionA.id)

      // La fila de B no ganó una partida fantasma por el intento rechazado.
      const { count } = await supabase
        .from('items_cotizacion')
        .select('id', { count: 'exact', head: true })
        .eq('cotizacion_id', cotizacionB.id)
      expect(count).toBe(0)
    } finally {
      await limpiarCotizacionDePrueba(supabase, cotizacionA.id)
      await limpiarCotizacionDePrueba(supabase, cotizacionB.id)
    }
  })
})
