import { requireSection } from '@/lib/api-auth'
import { cerrarCuentas } from '@/lib/server/cuentas/correcciones'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { SIN_PROYECTO_ID } from '@/lib/shared/cuentas/periodo-tipos'

const ROUTE = 'POST /api/cuentas/proyectos/:id/cerrar'

/**
 * Rediseño de Cuentas B7 (D5, D6): "Volver a cerrar" termina la reapertura
 * cuando ya no quedan pendientes. Solo admin.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  const { id } = await params
  if (!id || id === SIN_PROYECTO_ID || id.length > 100) return Response.json({ error: 'Proyecto inválido' }, { status: 400 })

  try {
    const usuario = authResult.session?.user?.email || 'sistema'
    return Response.json(await cerrarCuentas(id, usuario))
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
