import { getProyectoById, updateProyecto, generarHistorialProyecto } from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const proyecto = await getProyectoById(id)
    return Response.json(proyecto)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Captura estado anterior antes de actualizar
    const proyectoAnterior = await getProyectoById(id)

    const proyecto = await updateProyecto(id, body)

    // Genera historial solo al transicionar a FINALIZADO
    if (body.estado === 'FINALIZADO' && proyectoAnterior.estado !== 'FINALIZADO') {
      try {
        await generarHistorialProyecto(id, proyecto)
        console.log(`[PUT /api/proyectos/${id}] Historial generado al finalizar proyecto`)
      } catch (e) {
        console.error(`[PUT /api/proyectos/${id}] Error generando historial:`, e)
        // No-fatal: el proyecto ya se actualizó correctamente
      }
    }

    return Response.json(proyecto)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando proyecto' }, { status: 500 })
  }
}
