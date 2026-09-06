import { requireSection } from '@/lib/api-auth'
import { getTareasByProyecto, createTarea } from '@/lib/db'
import { ProyectoTareaCreateSchema, validate } from '@/lib/validation/schemas'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const tareas = await getTareasByProyecto(id)
    return Response.json(tareas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo tareas' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(ProyectoTareaCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    // origen='manual' siempre en este endpoint -- las de plantilla se
    // copian solo desde asignarTipoProyecto (señal para la futura capa de
    // sugerencias por IA, ver proyecto_tareas.origen).
    const tarea = await createTarea(id, { ...validation.data, origen: 'manual' })
    return Response.json(tarea, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando tarea' }, { status: 500 })
  }
}
