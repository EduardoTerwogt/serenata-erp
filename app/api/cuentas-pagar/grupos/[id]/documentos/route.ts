import { requireSection } from '@/lib/api-auth'
import { cargarDetallePago } from '@/lib/server/cuentas/detalle'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { subirArchivoCuenta } from '@/lib/server/cuentas/subir-archivo'

const ROUTE = 'GET /api/cuentas-pagar/grupos/[id]/documentos'

// Rediseño de Cuentas B5 (U2): detalle de un grupo de facturación -- sus
// renglones, factura, pagos (total a transferir), orden y cruce fiscal.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const detalle = await cargarDetallePago('grupo', id)
    if (!detalle) return Response.json({ error: 'Grupo de cuentas por pagar no encontrado' }, { status: 404 })
    return Response.json({ detalle })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}

const ROUTE_POST = 'POST /api/cuentas-pagar/grupos/[id]/documentos'

// Rediseño de Cuentas B5 (supuesto 15): el PDF de la factura se sube en su
// propia petición, después del XML.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const { status, body } = await subirArchivoCuenta({ destino: 'grupo', id, formData: await request.formData(), request })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE_POST)
  }
}
