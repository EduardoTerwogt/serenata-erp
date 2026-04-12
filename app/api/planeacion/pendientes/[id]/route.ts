import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return Response.json(
        { error: 'ID requerido' },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin
      .from('planeacion_pendientes')
      .update({ eliminada: true })
      .eq('id', id)

    if (error) {
      console.error('Error deleting pendiente:', error)
      return Response.json(
        { error: 'Error al eliminar pendiente' },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/planeacion/pendientes/[id] error:', err)
    return Response.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
