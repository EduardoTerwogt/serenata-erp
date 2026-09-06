import { requireSection } from '@/lib/api-auth'
import { getTareasDefaultByTipo, createTareaDefault } from '@/lib/db'
import { TipoProyectoTareaDefaultCreateSchema, validate } from '@/lib/validation/schemas'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const tareas = await getTareasDefaultByTipo(id)
    return Response.json(tareas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo tareas de plantilla' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(TipoProyectoTareaDefaultCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const tarea = await createTareaDefault(id, {
      titulo: validation.data.titulo,
      descripcion: validation.data.descripcion ?? null,
      es_hito: validation.data.es_hito ?? false,
      dias_antes_entrega: validation.data.dias_antes_entrega ?? null,
      orden: validation.data.orden,
    })
    return Response.json(tarea, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando tarea de plantilla' }, { status: 500 })
  }
}
