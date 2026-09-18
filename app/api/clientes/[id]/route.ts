import { requireSection } from '@/lib/api-auth'
import { getClienteById, updateCliente } from '@/lib/db'
import { validate, ClienteUpdateSchema } from '@/lib/validation/schemas'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const cliente = await getClienteById(id)
    return Response.json(cliente)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(ClienteUpdateSchema, body)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const cliente = await updateCliente(id, validation.data)
    return Response.json(cliente)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando cliente' }, { status: 500 })
  }
}
