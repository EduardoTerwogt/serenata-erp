import { requireSection } from '@/lib/api-auth'
import { updateTarea, deleteTarea } from '@/lib/db'
import { ProyectoTareaUpdateSchema, validate } from '@/lib/validation/schemas'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; tareaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { tareaId } = await params
    const body = await request.json()
    const validation = validate(ProyectoTareaUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const tarea = await updateTarea(tareaId, validation.data)
    return Response.json(tarea)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando tarea' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; tareaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { tareaId } = await params
    await deleteTarea(tareaId)
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando tarea' }, { status: 500 })
  }
}
