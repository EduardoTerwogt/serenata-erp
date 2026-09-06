import { requireSection } from '@/lib/api-auth'
import { updateChecklistItem, deleteChecklistItem } from '@/lib/db'
import { ProyectoTareaChecklistItemUpdateSchema, validate } from '@/lib/validation/schemas'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; tareaId: string; itemId: string }> }
) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { itemId } = await params
    const body = await request.json()
    const validation = validate(ProyectoTareaChecklistItemUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const item = await updateChecklistItem(itemId, validation.data)
    return Response.json(item)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando ítem de checklist' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tareaId: string; itemId: string }> }
) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { itemId } = await params
    await deleteChecklistItem(itemId)
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando ítem de checklist' }, { status: 500 })
  }
}
