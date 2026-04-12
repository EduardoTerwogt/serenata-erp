import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const { cotizacion_id, eventos } = body

    if (!cotizacion_id || !eventos || eventos.length === 0) {
      return Response.json(
        { error: 'cotizacion_id y eventos requeridos' },
        { status: 400 }
      )
    }

    // Guardar notas para cada evento
    const notasToInsert = eventos.map((evento: { fecha_evento: string; notas: string }) => ({
      cotizacion_id,
      fecha_evento: evento.fecha_evento,
      nota: evento.notas,
      tipo: 'contextual',
    }))

    const { error } = await supabaseAdmin
      .from('planeacion_event_notas')
      .insert(notasToInsert)

    if (error) {
      console.error('Error saving notes:', error)
      // No fail the request if notes saving fails, it's non-critical
      return Response.json({ success: true, warning: 'Notas no se guardaron' })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error in save-notes endpoint:', error)
    return Response.json(
      { success: true, warning: 'Error al guardar notas' },
      { status: 200 }
    )
  }
}
