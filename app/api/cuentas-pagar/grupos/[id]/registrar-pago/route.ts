import { requireSection } from '@/lib/api-auth'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { registrarPagoProveedor } from '@/lib/server/cuentas/registrar-pago-proveedor'

const ROUTE = 'POST /api/cuentas-pagar/grupos/[id]/registrar-pago'

// Pago a un grupo de facturación. El pago se reparte entre los conceptos del
// grupo (prorrateo en registrar_pago_grupo_factura, docs/PLAN.md). Rediseño
// de Cuentas B2: el monto es el total a transferir; la lógica vive en
// lib/server/cuentas/registrar-pago-proveedor.ts.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()
    const { status, body } = await registrarPagoProveedor({
      objetivo: 'grupo',
      id,
      formData,
      usuario: authResult.session?.user?.email ?? null,
      route: ROUTE,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
