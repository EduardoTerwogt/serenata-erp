import { requireSection } from '@/lib/api-auth'
import { getProyectos, createProyecto } from '@/lib/db'

export async function GET() {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const proyectos = await getProyectos()
    return Response.json(proyectos)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo proyectos' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const body = await request.json()
    const proyecto = await createProyecto(body)
    return Response.json(proyecto, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error creando proyecto' }, { status: 500 })
  }
}
