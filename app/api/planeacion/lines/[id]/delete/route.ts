import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('planeacion')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params

    if (!id) {
      return Response.json(
        { error: 'ID de línea requerido' },
        { status: 400 }
      )
    }

    // Marcar como eliminada (soft delete) en lugar de borrar
    const { error } = await supabaseAdmin
      .from('planeacion_pendientes')
      .update({ eliminada: true })
      .eq('id', id)

    if (error) {
      console.error('Error marking line as deleted:', error)
      return Response.json(
        { error: 'Error al eliminar línea' },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error in delete endpoint:', error)
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
