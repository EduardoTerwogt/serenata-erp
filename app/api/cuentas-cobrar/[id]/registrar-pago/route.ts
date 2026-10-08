import { requireSection } from '@/lib/api-auth'
import { getCuentaCobrarById, getProyectoById } from '@/lib/db'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { registrarPago } from '@/lib/server/cuentas/registrar-pago'
import { RegistrarPagoCobroSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas-cobrar/[id]/registrar-pago'

/**
 * Pago a una cuenta de cobro. #123 (B2): una cabecera `pagos` con una línea, por `registrar_pago_cobro`
 * (lib/server/cuentas/registrar-pago.ts); el pago de varias cuentas entra por `POST /api/cuentas/pagos`.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const formData = await request.formData()

    const comprobante = formData.get('comprobante') as File | null
    // Rediseño de Cuentas B1 (R4): Zod antes de tocar la base; acepta CHEQUE.
    const validation = validate(RegistrarPagoCobroSchema, {
      monto: formData.get('monto'),
      tipo_pago: formData.get('tipo_pago'),
      fecha_pago: formData.get('fecha_pago'),
      notas: formData.get('notas'),
      operation_id: formData.get('operation_id'),
    })
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 })
    }
    const { monto, tipo_pago: tipoPago, fecha_pago: fechaPago, operation_id: operationId } = validation.data

    // Orden de request (v13.1 §9): sintáctico -> operation_id/uuid (arriba) -> payloadHash -> consulta
    // idempotency_keys ANTES de leer la cuenta, Drive o la RPC (todo eso va dentro del servicio).
    const { status, body } = await registrarPago({
      lado: 'cobro',
      lineas: [{ id, monto }],
      tipoPago,
      fechaPago,
      notas: validation.data.notas ?? null,
      operationId,
      comprobante,
      usuario: authResult.session?.user?.email ?? null,
      route: ROUTE,
      scope: `cuentas-cobrar:${id}:registrar-pago`,
      resolver: async () => {
        const cuenta = await getCuentaCobrarById(id)
        if (!cuenta) return { status: 404, body: { error: 'Cuenta por cobrar no encontrada' } }
        let carpeta = `/Por Cobrar/${cuenta.cotizacion_id}`
        if (comprobante) {
          const proyecto = await getProyectoById(cuenta.cotizacion_id)
          if (!proyecto) return { status: 404, body: { error: 'Proyecto asociado no encontrado' } }
          carpeta = `/Por Cobrar/${cuenta.cotizacion_id}-${proyecto.proyecto}`
        }
        return { carpeta }
      },
    })

    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
