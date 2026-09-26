import { requireSection } from '@/lib/api-auth'
import { cargarOpciones } from '@/lib/server/cuentas/periodo-rpc'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { CuentasOpcionesQuerySchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'GET /api/cuentas/opciones'

/**
 * Rediseño de Cuentas O1b (E6): clientes y proveedores del año para los
 * filtros. Solo dependen del año, así que salieron de `/api/cuentas/periodo`
 * (eran ~300 KB de cada respuesta) y la pantalla los pide una vez por año.
 */
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const validation = validate(CuentasOpcionesQuerySchema, Object.fromEntries(new URL(request.url).searchParams.entries()))
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    return Response.json(await cargarOpciones(validation.data.anio))
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
