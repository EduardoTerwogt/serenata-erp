import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { checkDriveAuth } from '@/lib/integrations/google/drive'

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
    },
    { status: ok ? 200 : 500 }
  )
}
