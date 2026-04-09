import { requireSection } from '@/lib/api-auth'
import { getResponsableById, updateResponsable } from '@/lib/db'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const responsable = await getResponsableById(id)
    return Response.json(responsable)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Colaborador no encontrado' }, { status: 404 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const responsable = await updateResponsable(id, body)
    triggerSheetsSync('responsables')
    return Response.json(responsable)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando colaborador' }, { status: 500 })
  }
}
