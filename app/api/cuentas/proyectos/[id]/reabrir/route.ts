import { requireSection } from '@/lib/api-auth'
import { reabrirCuentas } from '@/lib/server/cuentas/correcciones'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { SIN_PROYECTO_ID } from '@/lib/shared/cuentas/periodo-tipos'
import { ReabrirCuentasSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/proyectos/:id/reabrir'

/**
 * Rediseño de Cuentas B7 (D5, D6, supuesto 10): reabrir las cuentas cerradas
 * de un proyecto para corregirlas. Solo admin; el motivo es obligatorio y
 * queda registrado con quién y cuándo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('admin')
  if (authResult.response) return authResult.response

  const { id } = await params
  if (!id || id === SIN_PROYECTO_ID || id.length > 100) return Response.json({ error: 'Proyecto inválido' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido: se esperaba JSON' }, { status: 400 })
  }
  const validation = validate(ReabrirCuentasSchema, body)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const usuario = authResult.session?.user?.email || 'sistema'
    return Response.json(await reabrirCuentas(id, validation.data.motivo, usuario))
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
