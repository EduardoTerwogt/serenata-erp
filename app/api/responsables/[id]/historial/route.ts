import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  console.log('[GET /api/responsables/:id/historial] responsable_id:', id)
  const { data, error } = await supabaseAdmin
    .from('historial_responsable')
    .select('*')
    .eq('responsable_id', id)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[historial] error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  console.log('[historial] registros encontrados:', data?.length ?? 0)
  return Response.json(data || [])
}
