// POST /api/integrations/sheets/sync-down
//
// Sincroniza datos de Supabase → Google Sheets.
// Sobrescribe completamente cada pestaña con los datos actuales.
//
// Body (opcional): { tables?: string[] }  — si se omite, sincroniza todas
//
// EF-3 3C-3: protegido por el lock de sheets_sync_status -- si otro proceso
// ya está sincronizando, responde 409 sin tocar Sheets. Renueva el lease
// tras cada página de cada tabla (heartbeat); si otro proceso reclama el
// lock porque el lease expiró a medio camino, aborta de inmediato (409, sin
// llamar release_sheets_sync_lock -- ya no es dueña del lock).

import { requireAnySection } from '@/lib/api-auth'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { syncAllDown, syncTableDownByName, SheetsSyncLeaseLostError, SyncHeartbeat } from '@/lib/integrations/sheets/sync-down'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { DomainError, buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE = 'POST /api/integrations/sheets/sync-down'
const LEASE_SECONDS = 600

export async function POST(req: Request) {
  const { response } = await requireAnySection(['cotizaciones'])
  if (response) return response

  const googleEnv = getGoogleEnv()
  if (!googleEnv) {
    return Response.json({ error: 'Google no configurado' }, { status: 503 })
  }

  const spreadsheetId = googleEnv.sheetsSpreadsheetId
  if (!spreadsheetId) {
    return Response.json(
      { error: 'GOOGLE_SHEETS_SPREADSHEET_ID no configurado. Primero ejecuta /api/integrations/sheets/setup.' },
      { status: 503 },
    )
  }

  let body: { tables?: string[] } = {}
  try { body = await req.json() } catch { /* sin body */ }

  const runId = crypto.randomUUID()
  const { data: acquired, error: acquireError } = await supabaseAdmin.rpc('acquire_sheets_sync_lock', {
    p_run_id: runId,
    p_triggered_by: 'manual:admin',
    p_lease_seconds: LEASE_SECONDS,
  })
  if (acquireError) return buildErrorResponse(acquireError, ROUTE)
  if (!acquired) {
    return buildErrorResponse(
      new DomainError({
        code: 'sheets_sync_locked',
        status: 409,
        safeMessage: 'Ya hay una sincronización en curso, intenta de nuevo en unos minutos.',
      }),
      ROUTE,
    )
  }

  // Destructurar `error` explícitamente y no solo `data` importa: si se
  // ignorara `error` de la llamada RPC (red, Postgres caído, timeout),
  // `data` llegaría `undefined`, indistinguible de un lease genuinamente
  // perdido (`data === false`) -- ambos producirían el mismo 409, ocultando
  // un problema de infraestructura detrás de un mensaje de negocio
  // incorrecto. Un error de la llamada se relanza tal cual.
  const heartbeat: SyncHeartbeat = async () => {
    const { data, error } = await supabaseAdmin.rpc('renew_sheets_sync_lease', {
      p_run_id: runId,
      p_lease_seconds: LEASE_SECONDS,
    })
    if (error) throw error
    return data === true
  }

  try {
    if (body.tables && body.tables.length > 0) {
      const results = []
      for (const tableName of body.tables) {
        results.push(await syncTableDownByName(spreadsheetId, tableName, heartbeat))
      }
      const errors = results.filter(r => !r.ok).length
      await releaseLock(runId, results.reduce((s, r) => s + r.rows, 0), errors, results)
      return Response.json({ spreadsheetId, results, state: errors > 0 ? 'error' : 'idle' })
    }

    const summary = await syncAllDown(spreadsheetId, heartbeat)
    await releaseLock(runId, summary.totalRows, summary.errors, summary.results)
    return Response.json({ ...summary, state: summary.errors > 0 ? 'error' : 'idle' })
  } catch (err: unknown) {
    if (err instanceof SheetsSyncLeaseLostError) {
      // No llama release_sheets_sync_lock: ya no es dueña del lock, el
      // run_id guardado en la tabla ya es de otro proceso -- llamar release
      // con su propio run_id viejo no afectaría esa fila igual, pero
      // omitirlo es más claro.
      return buildErrorResponse(
        new DomainError({
          code: 'sheets_sync_lease_lost',
          status: 409,
          safeMessage: 'Otra sincronización tomó el control, reintentar.',
          cause: err,
        }),
        ROUTE,
      )
    }
    // Fallo real de la RPC de renovación disparado en el heartbeat ENTRE
    // tablas de syncAllDown (que no tiene su propio try/catch) -- se
    // propaga sin capturar hasta aquí. Nunca se confunde con un lease
    // perdido: responde 500, nunca 409.
    return buildErrorResponse(err, ROUTE)
  }
}

async function releaseLock(
  runId: string,
  rowsSynced: number,
  tablesFailed: number,
  results: { tab: string; ok: boolean }[],
): Promise<void> {
  const errorMessage = tablesFailed > 0
    ? `${tablesFailed} de ${results.length} tablas fallaron: ${results.filter(r => !r.ok).map(r => r.tab).join(', ')}`
    : null
  const { error } = await supabaseAdmin.rpc('release_sheets_sync_lock', {
    p_run_id: runId,
    p_state: tablesFailed > 0 ? 'error' : 'idle',
    p_rows_synced: rowsSynced,
    p_tables_failed: tablesFailed,
    p_error_message: errorMessage,
  })
  if (error) throw error
}
