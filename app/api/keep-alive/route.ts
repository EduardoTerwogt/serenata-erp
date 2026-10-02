import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { checkDriveAuth } from '@/lib/integrations/google/drive'
import { ejecutarAuditoria } from '@/lib/server/auditoria'

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

  // PLAN.md B3 (K2): retención de las tablas de operaciones idempotentes. Un
  // operation_id solo sirve para reintentar una petición reciente: pasados 30
  // días la fila es historia y la tabla solo crece. NO se purgan reservas de
  // folio. Best-effort, igual que arriba.
  const operationsDeleted: Record<string, number | null> = { pago_operations: null, bulk_import_operations: null }
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  for (const table of ['pago_operations', 'bulk_import_operations'] as const) {
    try {
      const { error: cleanupError, count } = await supabaseAdmin
        .from(table)
        .delete({ count: 'exact' })
        .lt('created_at', thirtyDaysAgo)
      if (cleanupError) throw cleanupError
      operationsDeleted[table] = count ?? 0
    } catch (error) {
      console.error(`Keep-alive: ${table} cleanup failed:`, error)
    }
  }

  // B7 (F9): guardas de consistencia del modelo. Un hallazgo no marca el keep-alive como
  // fallido (su trabajo es mantener vivos la BD y Drive): queda en el log y en la respuesta,
  // y el administrador lo ve en Admin. Best-effort, igual que las limpiezas de arriba.
  let auditoria: { ok: boolean; total_violaciones: number | null } = { ok: false, total_violaciones: null }
  try {
    const resultado = await ejecutarAuditoria()
    auditoria = { ok: resultado.total_violaciones === 0, total_violaciones: resultado.total_violaciones }
    if (resultado.total_violaciones > 0) {
      const rotas = resultado.guardas.filter((g) => g.violaciones > 0).map((g) => `${g.clave}=${g.violaciones}`)
      console.error(`Keep-alive: auditar_consistencia encontró ${resultado.total_violaciones} violación(es): ${rotas.join(', ')}`)
    }
  } catch (error) {
    console.error('Keep-alive: auditar_consistencia failed:', error)
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
      pago_operations_deleted: operationsDeleted.pago_operations,
      bulk_import_operations_deleted: operationsDeleted.bulk_import_operations,
      auditoria,
    },
    { status: ok ? 200 : 500 }
  )
}
