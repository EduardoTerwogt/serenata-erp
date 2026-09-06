import { requireSection } from '@/lib/api-auth'
import { updateTareaDefault, deleteTareaDefault } from '@/lib/db'
import { TipoProyectoTareaDefaultUpdateSchema, validate } from '@/lib/validation/schemas'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; tareaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { tareaId } = await params
    const body = await request.json()
    const validation = validate(TipoProyectoTareaDefaultUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const tarea = await updateTareaDefault(tareaId, validation.data)
    return Response.json(tarea)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando tarea de plantilla' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; tareaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { tareaId } = await params
    await deleteTareaDefault(tareaId)
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando tarea de plantilla' }, { status: 500 })
  }
}
