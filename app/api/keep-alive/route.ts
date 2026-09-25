import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { checkDriveAuth } from '@/lib/integrations/google/drive'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { syncAllDown, SheetsSyncLeaseLostError, SyncHeartbeat } from '@/lib/integrations/sheets/sync-down'

// EF-3 3C-4: el safety-net de Sheets de abajo puede correr syncAllDown()
// completo -- mismo techo que generar-orden-pago/generar-pdf.
export const maxDuration = 60

export async function GET(request: Request) {
  // 1B-3: sin CRON_SECRET configurado, la comparación de abajo se hace
  // contra el literal "Bearer undefined" -- un secreto predecible. Falla
  // cerrado explícito antes de comparar, nunca abierto por configuración
  // ausente.
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let supabaseOk = true
  let supabaseError: string | undefined

  try {
    const { error } = await supabaseAdmin
      .from('cotizaciones')
      .select('id')
      .limit(1)

    if (error) throw error
  } catch (error) {
    console.error('Keep-alive: Supabase check failed:', error)
    supabaseOk = false
    supabaseError = error instanceof Error ? error.message : 'Unknown error'
  }

  const drive = await checkDriveAuth()
  if (drive.status === 'invalid_grant') {
    console.error('Keep-alive: Drive credentials invalid —', drive.message)
  }

  // 1E-1: retención de idempotency_keys -- borra únicamente filas COMPLETADAS
  // (status_code IS NOT NULL) con más de 7 días. Nunca una fila pendiente
  // (status_code NULL): su expiración/reconciliación es responsabilidad del
  // dominio (pago_operations/bulk_import_operations), no de esta limpieza.
  // Best-effort: un fallo aquí no afecta el resultado del keep-alive.
  let idempotencyKeysDeleted: number | null = null
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error: cleanupError, count } = await supabaseAdmin
      .from('idempotency_keys')
      .delete({ count: 'exact' })
      .not('status_code', 'is', null)
      .lt('created_at', sevenDaysAgo)
    if (cleanupError) throw cleanupError
    idempotencyKeysDeleted = count ?? 0
  } catch (error) {
    console.error('Keep-alive: idempotency_keys cleanup failed:', error)
  }

  // EF-3 3C-4 (F15): retención de rate_limits -- ventanas de rate limit con
  // más de 24h, best-effort igual que idempotency_keys arriba. Query
  // distinta: rate_limits no tiene status_code, filtra directo por su
  // columna real window_start (no created_at).
  let rateLimitsDeleted: number | null = null
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { error: cleanupError, count } = await supabaseAdmin
      .from('rate_limits')
      .delete({ count: 'exact' })
      .lt('window_start', twentyFourHoursAgo)
    if (cleanupError) throw cleanupError
    rateLimitsDeleted = count ?? 0
  } catch (error) {
    console.error('Keep-alive: rate_limits cleanup failed:', error)
  }

  // Rediseño de Cuentas B3 (O2, U4, R3): el estado guardado de los cobros
  // vencidos se actualiza aquí, una vez al día y antes del sync de Sheets,
  // en lugar de escribir en cada lectura. En pantalla "Vencido" se deriva al
  // leer. Best-effort: un fallo aquí no afecta el resultado del keep-alive.
  let cuentasCobrarSync: 'ok' | 'error' = 'ok'
  try {
    const { error: syncError } = await supabaseAdmin.rpc('sync_estados_cuentas_cobrar_vencidas')
    if (syncError) throw syncError
  } catch (error) {
    cuentasCobrarSync = 'error'
    console.error('Keep-alive: sync_estados_cuentas_cobrar_vencidas failed:', error)
  }

  // EF-3 3C-4: safety-net diario de Sheets, bajo el mismo lock de 3C-3 que
  // ya usa la sincronización manual (app/api/integrations/sheets/sync-down).
  // Si no consigue el lock (sync manual en curso, o lease de otro cron
  // vivo) se salta esta corrida por completo, en silencio -- best-effort,
  // Sheets nunca es parte del `ok` boolean de este endpoint.
  let sheetsSync: { ran: boolean; rows?: number; errors?: number } = { ran: false }
  const googleEnv = getGoogleEnv()
  if (googleEnv?.sheetsSpreadsheetId) {
    const spreadsheetId = googleEnv.sheetsSpreadsheetId
    const runId = crypto.randomUUID()
    const LEASE_SECONDS = 600
    try {
      const { data: acquired, error: acquireError } = await supabaseAdmin.rpc('acquire_sheets_sync_lock', {
        p_run_id: runId,
        p_triggered_by: 'cron:keep-alive',
        p_lease_seconds: LEASE_SECONDS,
      })
      if (acquireError) throw acquireError

      if (acquired) {
        const heartbeat: SyncHeartbeat = async () => {
          const { data, error } = await supabaseAdmin.rpc('renew_sheets_sync_lease', {
            p_run_id: runId,
            p_lease_seconds: LEASE_SECONDS,
          })
          if (error) throw error
          return data === true
        }

        const summary = await syncAllDown(spreadsheetId, heartbeat)
        const tablesFailed = summary.errors
        const { error: releaseError } = await supabaseAdmin.rpc('release_sheets_sync_lock', {
          p_run_id: runId,
          p_state: tablesFailed > 0 ? 'error' : 'idle',
          p_rows_synced: summary.totalRows,
          p_tables_failed: tablesFailed,
          p_error_message: tablesFailed > 0
            ? `${tablesFailed} de ${summary.results.length} tablas fallaron: ${summary.results.filter((r) => !r.ok).map((r) => r.tab).join(', ')}`
            : null,
        })
        if (releaseError) throw releaseError
        sheetsSync = { ran: true, rows: summary.totalRows, errors: tablesFailed }
      }
      // acquired === false: otro proceso ya tiene el lock -- se salta sin loggear, es el caso esperado, no un fallo.
    } catch (error) {
      // Lease perdido a medio camino: otro proceso ya reclamó el lock, esta
      // corrida ya no es su dueña -- nunca llama release (mismo criterio
      // que app/api/integrations/sheets/sync-down/route.ts), no es un fallo real.
      if (!(error instanceof SheetsSyncLeaseLostError)) {
        console.error('Keep-alive: Sheets safety-net failed:', error)
      }
    }
  }

  const ok = supabaseOk && drive.status !== 'invalid_grant' && drive.status !== 'error'

  return Response.json(
    {
      ok,
      timestamp: new Date().toISOString(),
      supabase: supabaseOk ? 'ok' : 'error',
      ...(supabaseError ? { supabase_error: supabaseError } : {}),
      drive: drive.status,
      ...(drive.message ? { drive_message: drive.message } : {}),
      idempotency_keys_deleted: idempotencyKeysDeleted,
      rate_limits_deleted: rateLimitsDeleted,
      cuentas_cobrar_sync: cuentasCobrarSync,
      sheets_sync: sheetsSync,
    },
    { status: ok ? 200 : 500 }
  )
}
