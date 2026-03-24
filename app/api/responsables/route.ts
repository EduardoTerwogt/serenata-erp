import { getResponsables, createResponsable } from '@/lib/db'

export async function GET() {
  try {
    const responsables = await getResponsables()
    return Response.json(responsables)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo responsables' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const responsable = await createResponsable({ ...body, activo: true })
    return Response.json(responsable, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando colaborador' }, { status: 500 })
  }
}
