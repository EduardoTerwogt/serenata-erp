import { requireSection } from '@/lib/api-auth'
import { getGastosFijos, createGastoFijo } from '@/lib/db'
import { GastoFijoCreateSchema, validate } from '@/lib/validation/schemas'

export async function GET() {
  const authResult = await requireSection('dashboard')
  if (authResult.response) return authResult.response

  try {
    const gastos = await getGastosFijos()
    return Response.json(gastos)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo gastos fijos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authResult = await requireSection('dashboard')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const validation = validate(GastoFijoCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const gasto = await createGastoFijo(validation.data)
    return Response.json(gasto, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando gasto fijo' }, { status: 500 })
  }
}
