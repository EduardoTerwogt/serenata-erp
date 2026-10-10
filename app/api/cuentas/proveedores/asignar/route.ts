import { requireSection } from '@/lib/api-auth'
import { prepararGrupoFacturaProveedor } from '@/lib/server/cuentas/preparar-grupo'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { ProveedorAsignarSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/proveedores/asignar'

/**
 * #140: asigna conceptos sin proveedor a un proveedor existente o recién dado de alta, sin exigir factura. Una sola
 * transacción en SQL (`preparar_grupo_factura_proveedor`, la misma de #130): alta, reasignación e historial. Un proyecto
 * histórico responde 409 `proyecto_historico`.
 */
export async function POST(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido: se esperaba JSON' }, { status: 400 })
  }
  const validation = validate(ProveedorAsignarSchema, body)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
  const d = validation.data

  try {
    const grupo = await prepararGrupoFacturaProveedor({
      proveedorId: d.proveedor_id ?? null,
      proveedor: d.proveedor,
      renglones: d.renglones,
      usuario: authResult.session?.user?.email ?? null,
      operationId: d.operation_id,
    })
    return Response.json(grupo)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
