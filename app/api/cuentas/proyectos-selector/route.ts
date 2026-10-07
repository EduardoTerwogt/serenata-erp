import { requireSection } from '@/lib/api-auth'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { cargarSelectorProyectos } from '@/lib/server/cuentas/proyectos-selector'
import { ProyectosSelectorQuerySchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'GET /api/cuentas/proyectos-selector'

/**
 * #130: proyectos paginados para el selector compartido de Subir factura (`modo=renglones`: con sus renglones, para
 * asignarlos al emisor de la factura) y de Registrar pago por proyecto (`modo=pago&lado=`: con las contrapartes que
 * tienen saldo de facturas). Solo lee; el saldo exacto lo da `GET /api/cuentas/estado-cuenta?proyectos=`.
 */
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  const params = Object.fromEntries(new URL(request.url).searchParams.entries())
  const validation = validate(ProyectosSelectorQuerySchema, params)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const v = validation.data
    const respuesta = await cargarSelectorProyectos({
      modo: v.modo,
      lado: v.lado,
      q: v.q || undefined,
      contraparte: v.contraparte,
      soloPendientes: v.solo_pendientes,
      page: v.page,
      pageSize: v.page_size,
    })
    return Response.json(respuesta)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
