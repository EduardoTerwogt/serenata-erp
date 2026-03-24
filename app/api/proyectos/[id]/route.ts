import { getProyectoById, updateProyecto } from '@/lib/db'

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
    const proyecto = await updateProyecto(id, body)
    return Response.json(proyecto)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando proyecto' }, { status: 500 })
  }
}
