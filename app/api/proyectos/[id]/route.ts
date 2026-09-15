import { requireSection } from '@/lib/api-auth'
import { getProyectoDetalle, updateProyectoWithRollback } from '@/lib/server/projects/service'
import { ProyectoUpdateSchema, validate } from '@/lib/validation/schemas'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE_PUT = 'PUT /api/proyectos/[id]'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const proyecto = await getProyectoDetalle(id)
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
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()

    const validation = validate(ProyectoUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const parsed = validation.data
    const { notas_por_item = {}, ...proyectoUpdates } = parsed

    const proyecto = await updateProyectoWithRollback(id, proyectoUpdates, notas_por_item as Record<string, string>)
    return Response.json(proyecto)
  } catch (error) {
    return buildErrorResponse(error, ROUTE_PUT)
  }
}
