import { requireSection } from '@/lib/api-auth'
import { getCuentaPagarGrupoById, getProyectoById } from '@/lib/db'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { registrarPago } from '@/lib/server/cuentas/registrar-pago'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { RegistrarPagoProveedorSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas-pagar/grupos/[id]/registrar-pago'

// Pago a un grupo de facturación. #123 (B2): una cabecera `pagos` con una línea, por `registrar_pago_proveedor`
// (lib/server/cuentas/registrar-pago.ts); el pago a varios grupos entra por `POST /api/cuentas/pagos`. El monto
// es el total a transferir (Rediseño de Cuentas B2, D3); la RPC lo prorratea entre los conceptos del grupo.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const comprobante = formData.get('comprobante') as File | null
    const validation = validate(RegistrarPagoProveedorSchema, {
      monto: formData.get('monto'),
      tipo_pago: formData.get('tipo_pago') || undefined,
      fecha_pago: formData.get('fecha_pago') || undefined,
      notas: formData.get('notas'),
      operation_id: formData.get('operation_id'),
    })
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

    const { status, body } = await registrarPago({
      lado: 'proveedor',
      lineas: [{ id, monto: validation.data.monto }],
      tipoPago: validation.data.tipo_pago ?? 'TRANSFERENCIA',
      fechaPago: validation.data.fecha_pago ?? hoyCdmx(),
      notas: validation.data.notas ?? null,
      operationId: validation.data.operation_id,
      comprobante,
      usuario: authResult.session?.user?.email ?? null,
      route: ROUTE,
      scope: `cuentas-pagar-grupos:${id}:registrar-pago`,
      resolver: async () => {
        const destino = await getCuentaPagarGrupoById(id)
        if (!destino) return { status: 404, body: { error: 'Grupo de cuentas por pagar no encontrado' } }
        const proyecto = comprobante ? await getProyectoById(destino.proyecto_id) : null
        return { carpeta: `/Por Pagar/${destino.proyecto_id}-${proyecto?.proyecto ?? destino.proyecto_id}` }
      },
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
