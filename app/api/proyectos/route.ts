import { requireSection } from '@/lib/api-auth'
import { getProyectos } from '@/lib/db'

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
