import { requireSection } from '@/lib/api-auth'
import { asignarTipoProyecto, TipoYaAsignadoError } from '@/lib/server/projects/tipo-assignment'
import { ProyectoAsignarTipoSchema, validate } from '@/lib/validation/schemas'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(ProyectoAsignarTipoSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const proyecto = await asignarTipoProyecto(id, validation.data.tipo_proyecto_id)
    return Response.json(proyecto)
  } catch (error) {
    if (error instanceof TipoYaAsignadoError) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    console.error(error)
    return Response.json(
      { error: `Error asignando tipo de proyecto: ${error instanceof Error ? error.message : JSON.stringify(error)}` },
      { status: 500 }
    )
  }
}
