import { requireSection } from '@/lib/api-auth'
import { getTareasAgregadas } from '@/lib/db'

export async function GET() {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const tareas = await getTareasAgregadas()
    return Response.json(tareas)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo tareas de todos los proyectos' }, { status: 500 })
  }
}
