import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('historial_responsable')
    .select('*')
    .eq('responsable_id', id)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[historial] error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json(data || [])
}
