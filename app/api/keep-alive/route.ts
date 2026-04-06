import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('cotizaciones')
      .select('id')
      .limit(1)

    if (error) throw error

    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      message: 'Supabase is alive',
    })
  } catch (error) {
    console.error('Keep-alive failed:', error)
    return Response.json({
      ok: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
