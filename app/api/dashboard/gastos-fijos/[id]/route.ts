import { requireSection } from '@/lib/api-auth'
import { updateGastoFijo } from '@/lib/db'
import { GastoFijoUpdateSchema, validate } from '@/lib/validation/schemas'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('dashboard')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(GastoFijoUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const gasto = await updateGastoFijo(id, validation.data)
    return Response.json(gasto)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando gasto fijo' }, { status: 500 })
  }
}
