import { requireSection } from '@/lib/api-auth'
import {
  cambiarEtapaProyecto,
  EtapaNoPerteneceATipoError,
  ProyectoSinTipoError,
} from '@/lib/server/projects/tipo-assignment'
import { ProyectoCambiarEtapaSchema, validate } from '@/lib/validation/schemas'
import { triggerSheetsSync } from '@/lib/integrations/sheets/trigger'
import { DomainError, buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE = 'PUT /api/proyectos/[id]/etapa'

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
    // lib/server/projects/tipo-assignment.ts no se toca -- el mapeo a
    // DomainError es responsabilidad exclusiva de la frontera HTTP, mismo
    // mensaje/status 400 que antes.
    if (error instanceof ProyectoSinTipoError || error instanceof EtapaNoPerteneceATipoError) {
      return buildErrorResponse(
        new DomainError({ code: error.name, status: 400, safeMessage: error.message, cause: error }),
        ROUTE
      )
    }
    return buildErrorResponse(error, ROUTE)
  }
}
