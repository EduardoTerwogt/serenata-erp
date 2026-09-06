import { requireSection } from '@/lib/api-auth'
import { getEtapasByTipo, createEtapa } from '@/lib/db'
import { TipoProyectoEtapaCreateSchema, validate } from '@/lib/validation/schemas'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const etapas = await getEtapasByTipo(id)
    return Response.json(etapas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo etapas' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(TipoProyectoEtapaCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const etapa = await createEtapa(id, validation.data)
    return Response.json(etapa, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando etapa' }, { status: 500 })
  }
}
