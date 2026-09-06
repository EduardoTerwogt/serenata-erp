import { requireSection } from '@/lib/api-auth'
import { updateEtapa, deleteEtapa } from '@/lib/db'
import { TipoProyectoEtapaUpdateSchema, validate } from '@/lib/validation/schemas'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; etapaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { etapaId } = await params
    const body = await request.json()
    const validation = validate(TipoProyectoEtapaUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const etapa = await updateEtapa(etapaId, validation.data)
    return Response.json(etapa)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando etapa' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; etapaId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { etapaId } = await params
    await deleteEtapa(etapaId)
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando etapa' }, { status: 500 })
  }
}
