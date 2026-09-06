import { requireSection } from '@/lib/api-auth'
import {
  cambiarEtapaProyecto,
  EtapaNoPerteneceATipoError,
  ProyectoSinTipoError,
} from '@/lib/server/projects/tipo-assignment'
import { ProyectoCambiarEtapaSchema, validate } from '@/lib/validation/schemas'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(ProyectoCambiarEtapaSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const proyecto = await cambiarEtapaProyecto(id, validation.data.etapa_id)
    triggerSheetsSync('proyectos', 'historial_responsable')
    return Response.json(proyecto)
  } catch (error) {
    if (error instanceof ProyectoSinTipoError || error instanceof EtapaNoPerteneceATipoError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    console.error(error)
    return Response.json(
      { error: `Error cambiando etapa: ${error instanceof Error ? error.message : JSON.stringify(error)}` },
      { status: 500 }
    )
  }
}
