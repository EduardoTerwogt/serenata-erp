import { requireSection } from '@/lib/api-auth'
import { cargarDetalleCobro } from '@/lib/server/cuentas/detalle'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { subirArchivoCuenta } from '@/lib/server/cuentas/subir-archivo'

const ROUTE = 'GET /api/cuentas-cobrar/[id]/documentos'

// Rediseño de Cuentas B5 (U2): detalle del cobro -- cuenta, factura,
// pagos con su complemento y estado derivado (concepto.ts).
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const detalle = await cargarDetalleCobro(id)
    if (!detalle) return Response.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    return Response.json({ detalle })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}

const ROUTE_POST = 'POST /api/cuentas-cobrar/[id]/documentos'

// Rediseño de Cuentas B5 (supuesto 15): el PDF de la factura se sube en su
// propia petición, después del XML.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const { status, body } = await subirArchivoCuenta({ destino: 'cobro', id, formData: await request.formData(), request })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE_POST)
  }
}
