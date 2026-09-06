import { requireSection } from '@/lib/api-auth'
import { getEquipoDeProyecto } from '@/lib/server/projects/equipo'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const equipo = await getEquipoDeProyecto(id)
    return Response.json(equipo)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo equipo del proyecto' }, { status: 500 })
  }
}
