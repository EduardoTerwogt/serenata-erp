import { requireSection } from '@/lib/api-auth'
import { getTiposProyecto, createTipoProyecto } from '@/lib/db'
import { TipoProyectoCreateSchema, validate } from '@/lib/validation/schemas'

export async function GET() {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const tipos = await getTiposProyecto()
    return Response.json(tipos)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo tipos de proyecto' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const validation = validate(TipoProyectoCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const tipo = await createTipoProyecto(validation.data.nombre)
    return Response.json(tipo, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando tipo de proyecto' }, { status: 500 })
  }
}
