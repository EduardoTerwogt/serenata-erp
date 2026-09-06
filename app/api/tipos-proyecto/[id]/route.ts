import { requireSection } from '@/lib/api-auth'
import { getTipoProyectoById, updateTipoProyecto } from '@/lib/db'
import { TipoProyectoUpdateSchema, validate } from '@/lib/validation/schemas'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const tipo = await getTipoProyectoById(id)
    return Response.json(tipo)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Tipo de proyecto no encontrado' }, { status: 404 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(TipoProyectoUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const tipo = await updateTipoProyecto(id, validation.data)
    return Response.json(tipo)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando tipo de proyecto' }, { status: 500 })
  }
}
