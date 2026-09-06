import { requireSection } from '@/lib/api-auth'
import { getChecklistByTarea, createChecklistItem } from '@/lib/db'
import { ProyectoTareaChecklistItemCreateSchema, validate } from '@/lib/validation/schemas'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; tareaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { tareaId } = await params
    const checklist = await getChecklistByTarea(tareaId)
    return Response.json(checklist)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo checklist' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; tareaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { tareaId } = await params
    const body = await request.json()
    const validation = validate(ProyectoTareaChecklistItemCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const item = await createChecklistItem(tareaId, validation.data)
    return Response.json(item, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando ítem de checklist' }, { status: 500 })
  }
}
