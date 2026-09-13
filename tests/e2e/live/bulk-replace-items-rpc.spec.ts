import { test, expect, BrowserContext, Page } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, getLiveSupabaseAdmin } from '../utils/live-cleanup'
import { faltantesDelEntornoLive, liveEnabled } from '../utils/live-helpers'

/**
 * Prueba SQL/RPC directa (Engineering Hardening EF-1, fix post-auditoría de
 * PR #29): llama `bulk_replace_items_cotizacion` vía supabase-js admin,
 * SIN pasar por la ruta HTTP -- la misma forma en que la app la invoca
 * (`supabaseAdmin.rpc(...)`), pero aislada de la capa de idempotencia HTTP
 * para probar la RPC en sí misma.
 *
 * Hallazgo corregido: una fila de `p_reemplazar_ids` borrada por una
 * operación concurrente (después de que el cliente tomó su snapshot
 * `{id, revision}`, antes de que este bulk corriera) no producía P1410 --
 * el chequeo solo comparaba `revision` cuando la fila SEGUÍA existiendo. Si
 * esa misma id venía en `p_items` (el cliente, con el snapshot viejo,
 * seguía creyéndola viva), el `INSERT ... ON CONFLICT` la recreaba de cero.
 * Este test reproduce exactamente ese escenario: snapshot -> borrado
 * concurrente -> bulk -> debe rechazar con P1410 -- y confirma cero
 * mutaciones (la fila no revive, no queda evidencia en
 * `bulk_import_operations`).
 */

const PREFIJO = 'E2E-LIVE-BULK-RPC-'

test.describe('live: guard del entorno (bulk_replace_items_cotizacion)', () => {
  test('el entorno live está configurado cuando CI lo exige', () => {
    test.skip(process.env.PLAYWRIGHT_LIVE_REQUIRED !== 'true', 'Solo aplica en el job live de CI')
    expect(faltantesDelEntornoLive(), 'Faltan variables del entorno live').toEqual([])
  })
})

test.describe('live: bulk_replace_items_cotizacion -- P1410 por fila borrada concurrentemente', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')

  let context: BrowserContext
  let page: Page
  let cotizacionId = ''

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(60_000)
    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live bulk-rpc] barrido inicial:', e))

    context = await browser.newContext()
    page = await context.newPage()
    await login(page, '/cotizaciones')
  })

  test.afterAll(async () => {
    await context?.close()
    if (cotizacionId) await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error('[live bulk-rpc] cleanup:', e))
    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live bulk-rpc] barrido final:', e))
  })

  test('snapshot {id,revision} -> fila borrada antes del bulk -> P1410 -> cero mutaciones', async () => {
    test.setTimeout(30_000)
    const suffix = Date.now()

    const createResponse = await page.request.post('/api/cotizaciones', {
      data: {
        cliente: `${PREFIJO}${suffix}`,
        proyecto: `Bulk RPC ${suffix}`,
        estado: 'BORRADOR',
        items: [{ categoria: 'Equipo', descripcion: 'Item original', cantidad: 1, precio_unitario: 100, x_pagar: 0, orden: 0 }],
      },
    })
    expect(createResponse.status(), `no se pudo crear la cotización de prueba: ${await createResponse.text()}`).toBe(201)
    const created = await createResponse.json() as { id: string; items: Array<{ id: string }> }
    cotizacionId = created.id
    const itemId = created.items[0]?.id
    expect(itemId, 'la cotización de prueba debería traer al menos un item con id').toBeTruthy()

    // 1. Snapshot del cliente: {id, revision} -- un item recién creado
    // siempre nace en revision 0 (default de la columna).
    const snapshotRevision = 0

    // 2. Borrado CONCURRENTE de esa misma fila -- simula a otro colaborador
    // borrando la partida justo antes de que este bulk corra.
    const admin = getLiveSupabaseAdmin()
    const { error: deleteError } = await admin.from('items_cotizacion').delete().eq('id', itemId)
    expect(deleteError, `no se pudo borrar la fila de prueba: ${deleteError?.message}`).toBeNull()

    // 3. El bulk llega después, con el snapshot viejo: cree que la fila
    // sigue viva y la reutiliza tanto en `p_items` (la "recrea") como en
    // `p_reemplazar_ids` (con la revision capturada antes del borrado).
    const operationId = crypto.randomUUID()
    const { data, error: rpcError } = await admin.rpc('bulk_replace_items_cotizacion', {
      p_operation_id: operationId,
      p_cotizacion_id: cotizacionId,
      p_items: [{
        id: itemId, categoria: 'Equipo', descripcion: 'Item recreado por error', cantidad: 1,
        precio_unitario: 100, importe: 100, x_pagar: 0, margen: 100, orden: 0,
      }],
      p_reemplazar_ids: [{ id: itemId, revision: snapshotRevision }],
    })

    expect(data, 'la RPC no debería devolver resultado -- debió rechazar con una excepción').toBeNull()
    expect(rpcError, 'la RPC debería rechazar con P1410 en vez de recrear la fila borrada').not.toBeNull()
    expect(rpcError?.code).toBe('P1410')
    expect(rpcError?.message || '').toContain('conflicto de revision')

    // 4. Cero mutaciones: la fila no revivió, y no quedó evidencia durable
    // de la operación (la excepción abortó toda la transacción).
    const { data: itemsRestantes, error: selectError } = await admin
      .from('items_cotizacion')
      .select('id')
      .eq('cotizacion_id', cotizacionId)
    expect(selectError).toBeNull()
    expect(itemsRestantes, 'ninguna fila debería existir para esta cotización -- la borrada no debió recrearse').toEqual([])

    const { data: bulkOp } = await admin
      .from('bulk_import_operations')
      .select('operation_id')
      .eq('operation_id', operationId)
      .maybeSingle()
    expect(bulkOp, 'no debería haber quedado evidencia durable de una operación que rechazó por completo').toBeNull()
  })
})
