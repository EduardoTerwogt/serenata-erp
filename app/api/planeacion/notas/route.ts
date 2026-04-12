import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const cotizacionId = searchParams.get('cotizacion_id')

    if (!cotizacionId) {
      return Response.json(
        { error: 'cotizacion_id requerido' },
        { status: 400 }
      )
    }

    // Obtener notas asociadas a esta cotización
    const { data, error } = await supabaseAdmin
      .from('planeacion_event_notas')
      .select('*')
      .eq('cotizacion_id', cotizacionId)
      .order('fecha_evento', { ascending: true })

    if (error) {
      console.error('Error fetching notes:', error)
      return Response.json(
        { error: 'Error al obtener notas' },
        { status: 500 }
      )
    }

    return Response.json({ notas: data || [] })
  } catch (error) {
    console.error('Error in notas endpoint:', error)
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
