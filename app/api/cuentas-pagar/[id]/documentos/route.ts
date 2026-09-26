import { requireSection } from '@/lib/api-auth'
import { cargarDetallePago } from '@/lib/server/cuentas/detalle'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { subirArchivoCuenta } from '@/lib/server/cuentas/subir-archivo'

const ROUTE = 'GET /api/cuentas-pagar/[id]/documentos'

// Rediseño de Cuentas B5 (U2): detalle de una cuenta por pagar. Si la cuenta
// pertenece a un grupo de facturación, el detalle es el del grupo (ahí viven
// la factura y los pagos).
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const detalle = await cargarDetallePago('cuenta', id)
    if (!detalle) return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    return Response.json({ detalle })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}

const ROUTE_POST = 'POST /api/cuentas-pagar/[id]/documentos'

// Rediseño de Cuentas B5 (supuesto 15): el PDF de la factura se sube en su
// propia petición, después del XML.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const { status, body } = await subirArchivoCuenta({ destino: 'cuenta', id, formData: await request.formData(), request })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE_POST)
  }
}
