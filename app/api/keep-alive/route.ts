import { supabaseAdmin } from '@/lib/supabase'
import { checkDriveAuth } from '@/lib/integrations/google/drive'

export async function GET(request: Request) {
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

  const ok = supabaseOk && drive.status !== 'invalid_grant' && drive.status !== 'error'

  return Response.json(
    {
      ok,
      timestamp: new Date().toISOString(),
      supabase: supabaseOk ? 'ok' : 'error',
      ...(supabaseError ? { supabase_error: supabaseError } : {}),
      drive: drive.status,
      ...(drive.message ? { drive_message: drive.message } : {}),
    },
    { status: ok ? 200 : 500 }
  )
}
