/**
 * EF-3A 3A-4: borra en cascada todas las filas de fixtures de una corrida
 * de carga (`runId`), identificadas por el prefijo `LOADTEST-${runId}-`
 * (case-insensitive vía `.ilike()`) en la columna que cada tabla usa para
 * taggear sus filas. JavaScript puro, sin anotaciones de tipo -- Node lo
 * corre directo, sin transpilar.
 *
 * `.range()` sin `.order()` no garantiza un orden estable entre páginas en
 * Postgres -- una fila puede duplicarse u omitirse igual que el bug de
 * offset ya corregido en 3B-5/3B-6/3C-2. Keyset por `id` (uuid, cursor
 * seguro), mismo patrón que el resto del plan.
 *
 * Inventario cerrado -- 3 tablas reales quedan deliberadamente fuera del
 * cleanup por runId, verificado contra el código real (no por omisión):
 * - `pago_operations`: ningún escenario de carga de 3A-5 llama
 *   POST .../registrar-pago -- la tabla y sus callers reales sí la usan
 *   fuera de esta suite, pero esta suite nunca escribe ahí.
 * - `idempotency_keys`/`bulk_import_operations`: bookkeeping efímero de
 *   requests, no datos de negocio visibles en una pantalla --
 *   `idempotency_keys` ya tiene retención propia por TTL (3C-4).
 * - `ordenes_pago`: `POST /api/cuentas-pagar/generar-orden-pago` agrupa
 *   TODAS las cuentas_pagar pendientes reales del entorno, sin acotar por
 *   runId -- borrar esa fila después arriesgaría destruir historial ajeno.
 *   `cuentas.js` (3A-5) excluye explícitamente esa ruta de su set de
 *   acciones -- el load test nunca escribe ahí, así que no necesita cleanup.
 */
import { createClient } from '@supabase/supabase-js'

const PAGE_SIZE = 500
// CHUNK_SIZE acota cuántos valores van en un filtro .in()/.delete() de
// PostgREST -- ese filtro siempre viaja en la query string de la URL
// (incluso para DELETE). 150 deja margen real frente a límites prácticos
// de proxies/gateways -- validado empíricamente contra serenata-erp-test
// real con >=300 filas antes de aceptar este bloque (punto 10 de 3A-4).
const CHUNK_SIZE = 150

export async function discoverIdsByPrefix(supabaseAdmin, table, column, runId) {
  const pattern = `LOADTEST-${runId}-%`
  const all = []
  let cursorId = null
  while (true) {
    let query = supabaseAdmin
      .from(table).select('id')
      .ilike(column, pattern)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
    if (cursorId !== null) query = query.gt('id', cursorId)
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data.map((r) => r.id))
    cursorId = data[data.length - 1].id
    if (data.length < PAGE_SIZE) break
  }
  return all
}

export async function discoverIdsWhereIn(supabaseAdmin, table, column, values) {
  const all = []
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE)
    let cursorId = null
    while (true) {
      let query = supabaseAdmin
        .from(table).select('id')
        .in(column, chunk)
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)
      if (cursorId !== null) query = query.gt('id', cursorId)
      const { data, error } = await query
      if (error) throw error
      if (!data || data.length === 0) break
      all.push(...data.map((r) => r.id))
      cursorId = data[data.length - 1].id
      if (data.length < PAGE_SIZE) break
    }
  }
  return all
}

async function deleteWhereInChunks(supabaseAdmin, table, column, values) {
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE)
    const { error } = await supabaseAdmin.from(table).delete().in(column, chunk)
    if (error) throw error
  }
}

// Envoltorio para el caso más común (borrar por PK 'id') -- solo la
// limpieza de cotizacion_folio_reservations (PK real 'token', se borra por
// 'folio') llama deleteWhereInChunks directo con la columna explícita.
async function deleteByIdsInChunks(supabaseAdmin, table, ids) {
  return deleteWhereInChunks(supabaseAdmin, table, 'id', ids)
}

export async function bulkCleanupLoadTestRun(supabaseAdmin, runId) {
  const counts = {}

  // Orden que respeta FKs: hojas primero, raíz al final.
  const cotizacionIds = await discoverIdsByPrefix(supabaseAdmin, 'cotizaciones', 'cliente', runId)
  if (cotizacionIds.length > 0) {
    const itemIds = await discoverIdsWhereIn(supabaseAdmin, 'items_cotizacion', 'cotizacion_id', cotizacionIds)
    await deleteByIdsInChunks(supabaseAdmin, 'items_cotizacion', itemIds)
    counts.items_cotizacion = itemIds.length

    const historialIds = await discoverIdsWhereIn(supabaseAdmin, 'historial_responsable', 'cotizacion_id', cotizacionIds)
    await deleteByIdsInChunks(supabaseAdmin, 'historial_responsable', historialIds)
    counts.historial_responsable = historialIds.length

    const cpIds = await discoverIdsWhereIn(supabaseAdmin, 'cuentas_pagar', 'cotizacion_id', cotizacionIds)
    await deleteByIdsInChunks(supabaseAdmin, 'cuentas_pagar', cpIds)
    counts.cuentas_pagar = cpIds.length

    const ccIds = await discoverIdsWhereIn(supabaseAdmin, 'cuentas_cobrar', 'cotizacion_id', cotizacionIds)
    await deleteByIdsInChunks(supabaseAdmin, 'cuentas_cobrar', ccIds)
    counts.cuentas_cobrar = ccIds.length

    await deleteByIdsInChunks(supabaseAdmin, 'proyectos', cotizacionIds) // proyecto_id = cotizacion_id principal
    counts.proyectos = cotizacionIds.length

    // cotizacion_folio_reservations: PK real es `token` (uuid), no `id` --
    // confirmado en db/migrations/20260408_atomic_cotizacion_folio_reservations.sql.
    // Su columna `folio` guarda exactamente el mismo string que
    // cotizaciones.id (SH### o SH###-A) para la reserva que originó esa
    // cotización -- mismo patrón que ya usa live-cleanup.ts
    // (.eq('folio', cotizacionId)) generalizado a .in(). No hace falta
    // descubrir nada por prefijo: cotizacionIds ya trae los folios exactos.
    await deleteWhereInChunks(supabaseAdmin, 'cotizacion_folio_reservations', 'folio', cotizacionIds)

    await deleteByIdsInChunks(supabaseAdmin, 'cotizaciones', cotizacionIds)
    counts.cotizaciones = cotizacionIds.length
  }

  const usuarioIds = await discoverIdsByPrefix(supabaseAdmin, 'usuarios', 'email', runId)
  await deleteByIdsInChunks(supabaseAdmin, 'usuarios', usuarioIds)
  counts.usuarios = usuarioIds.length

  const proveedorIds = await discoverIdsByPrefix(supabaseAdmin, 'proveedores', 'correo', runId)
  await deleteByIdsInChunks(supabaseAdmin, 'proveedores', proveedorIds)
  counts.proveedores = proveedorIds.length

  // clientes/productos: autosaveClienteYProyecto()/autosaveProductos()
  // (lib/server/quotations/persistence.ts) crean/actualizan estas filas al
  // guardar una cotización con un cliente/descripción de item que no
  // exista todavía en el catálogo -- confirmado que sí escriben ahí. Los
  // fixtures de 3A-3/k6 embeben runId en `cliente` (ya usado arriba) y en
  // la `descripcion` de cada item nuevo, precisamente para que sean
  // descubribles aquí.
  const clienteIds = await discoverIdsByPrefix(supabaseAdmin, 'clientes', 'nombre', runId)
  await deleteByIdsInChunks(supabaseAdmin, 'clientes', clienteIds)
  counts.clientes = clienteIds.length

  const productoIds = await discoverIdsByPrefix(supabaseAdmin, 'productos', 'descripcion', runId)
  await deleteByIdsInChunks(supabaseAdmin, 'productos', productoIds)
  counts.productos = productoIds.length

  return counts
}

// bulk-cleanup.mjs es JS plano y no puede importar
// lib/integrations/google/drive.ts directo (sin tsx/ts-node, sin alias
// `@/` fuera de Next.js) -- borra la carpeta real vía
// DELETE /api/internal/loadtest-drive-folder?folderId=<id>, que sí corre
// dentro de Next.js y llama deleteDriveFile() real. Ese endpoint ya trata
// un 404 de Google (carpeta ya borrada) como éxito idempotente -- un 404
// de ESTA respuesta significa siempre guard fallido (LOADTEST_MODE/secreto),
// nunca "la carpeta no existe".
export async function deleteDriveFolderViaApi(targetUrl, loadtestEnvSecret, folderId) {
  const res = await fetch(
    `${targetUrl}/api/internal/loadtest-drive-folder?folderId=${encodeURIComponent(folderId)}`,
    { method: 'DELETE', headers: { 'x-loadtest-secret': loadtestEnvSecret } }
  )
  if (!res.ok) {
    throw new Error(`bulk-cleanup: no se pudo borrar la carpeta de Drive ${folderId} (status ${res.status})`)
  }
}

/**
 * Barrido de corridas huérfanas: `loadtest_runs` con `cleaned_at IS NULL`
 * y más viejas que 2 horas son corridas que murieron a medio camino en un
 * runner que ya no existe -- se limpian igual (Postgres + su carpeta de
 * Drive), sin depender de ningún estado local del runner.
 */
export async function sweepOrphanedRuns(supabaseAdmin, targetUrl, loadtestEnvSecret) {
  const twoHoursAgoIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: orphans, error } = await supabaseAdmin
    .from('loadtest_runs')
    .select('run_id, drive_folder_id')
    .is('cleaned_at', null)
    .lt('started_at', twoHoursAgoIso)
  if (error) throw error

  for (const { run_id: runId, drive_folder_id: driveFolderId } of orphans ?? []) {
    console.log(`bulk-cleanup: barrido de corrida huérfana ${runId}`)
    await bulkCleanupLoadTestRun(supabaseAdmin, runId)
    if (driveFolderId) await deleteDriveFolderViaApi(targetUrl, loadtestEnvSecret, driveFolderId)
    await supabaseAdmin.from('loadtest_runs').update({ cleaned_at: new Date().toISOString() }).eq('run_id', runId)
  }
  return orphans?.length ?? 0
}

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return {
    runId: get('--run-id'),
    sweepOrphans: args.includes('--sweep-orphans'),
    targetUrl: get('--target-url')?.replace(/\/$/, ''),
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`bulk-cleanup: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

// CLI directo (node scripts/loadtest/bulk-cleanup.mjs --target-url <url>
// --run-id <uuid> | --sweep-orphans) -- import { bulkCleanupLoadTestRun }
// from './bulk-cleanup.mjs' cuando otro script (3A-6) necesita llamarlo
// como función, sin pasar por el CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { runId, sweepOrphans, targetUrl } = parseArgs()
  if ((!runId && !sweepOrphans) || !targetUrl) {
    console.error(
      'Uso: node scripts/loadtest/bulk-cleanup.mjs --target-url <url> --run-id <uuid> | --sweep-orphans'
    )
    process.exit(1)
  }

  const loadtestEnvSecret = requireEnv('LOADTEST_ENV_SECRET')
  const supabaseUrl = requireEnv('TEST_SUPABASE_URL')
  const serviceRoleKey = requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const main = async () => {
    if (sweepOrphans) {
      const n = await sweepOrphanedRuns(supabaseAdmin, targetUrl, loadtestEnvSecret)
      console.log(`bulk-cleanup: ${n} corridas huérfanas limpiadas`)
    }
    if (runId) {
      const { data: runRow } = await supabaseAdmin
        .from('loadtest_runs')
        .select('drive_folder_id')
        .eq('run_id', runId)
        .maybeSingle()

      const counts = await bulkCleanupLoadTestRun(supabaseAdmin, runId)
      console.log('bulk-cleanup: filas borradas por tabla:', counts)

      if (runRow?.drive_folder_id) {
        await deleteDriveFolderViaApi(targetUrl, loadtestEnvSecret, runRow.drive_folder_id)
        console.log(`bulk-cleanup: carpeta de Drive ${runRow.drive_folder_id} borrada`)
      }

      await supabaseAdmin
        .from('loadtest_runs')
        .update({ cleaned_at: new Date().toISOString() })
        .eq('run_id', runId)
    }
  }

  main().catch((err) => {
    console.error(err.message ?? err)
    process.exit(1)
  })
}
