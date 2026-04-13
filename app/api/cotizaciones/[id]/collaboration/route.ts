import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { CotizacionCollabActivityEvent } from '@/lib/types'

const ALLOWED_EVENTS: CotizacionCollabActivityEvent['event_type'][] = [
  'join',
  'leave',
  'start_edit_section',
  'stop_edit_section',
  'save',
]
const ALLOWED_SECTIONS = ['notas', 'general', 'partidas', 'totales'] as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 25), 1), 100)

  const { data, error } = await supabaseAdmin
    .from('cotizacion_collaboration_events')
    .select('*')
    .eq('cotizacion_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GET /api/cotizaciones/:id/collaboration] Error:', error)
    return Response.json({ error: 'Error consultando actividad de colaboración' }, { status: 500 })
  }

  return Response.json(data ?? [])
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  const { id } = await params
  const body = await request.json().catch(() => null)
  const eventType = body?.event_type as CotizacionCollabActivityEvent['event_type'] | undefined

  if (!eventType || !ALLOWED_EVENTS.includes(eventType)) {
    return Response.json({ error: 'event_type inválido' }, { status: 400 })
  }
  if (typeof body?.section === 'string' && !ALLOWED_SECTIONS.includes(body.section)) {
    return Response.json({ error: 'section inválida' }, { status: 400 })
  }

  const user = authResult.session?.user as { id?: string; email?: string | null; name?: string | null } | undefined
  const userId = user?.id || user?.email || 'unknown'
  const userEmail = user?.email || ''
  const userName = user?.name || user?.email || 'Usuario'

  const insertPayload = {
    cotizacion_id: id,
    user_id: userId,
    user_email: userEmail,
    user_name: userName,
    event_type: eventType,
    section: typeof body?.section === 'string' ? body.section : null,
    metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : null,
  }

  const { data, error } = await supabaseAdmin
    .from('cotizacion_collaboration_events')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    console.error('[POST /api/cotizaciones/:id/collaboration] Error:', error)
    return Response.json({ error: 'Error guardando evento de colaboración' }, { status: 500 })
  }

  return Response.json(data)
}
