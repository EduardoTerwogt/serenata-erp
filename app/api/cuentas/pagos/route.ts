import { requireSection } from '@/lib/api-auth'
import { carpetaContraparte } from '@/lib/server/cuentas/carpetas'
import { resolverContraparteDeDestinos } from '@/lib/server/cuentas/contrapartes'
import { registrarPago } from '@/lib/server/cuentas/registrar-pago'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { leerDatosMultipart } from '@/lib/server/uploads/datos-multipart'
import { MAX_FILE_SIZE, MENSAJE_LIMITE } from '@/lib/server/uploads/factura-validation'
import { PagoCrearSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/pagos'

const TIPOS_COMPROBANTE = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']

/**
 * #123 (B3, P7, P10): un pago a una o varias cuentas de cobro (cliente) o grupos de proveedor, con su comprobante
 * una sola vez (P16). Despacha a la RPC del lado (`registrar_pago_cobro` / `registrar_pago_proveedor`) por el mismo
 * servicio que las rutas por cuenta; sin tope de líneas (P25). Multipart: `datos` (JSON) y `comprobante` opcional.
 * Idempotente por `operation_id`; el saldo que el usuario vio viaja con cada línea (409 `candidatos_cambiaron`).
 */
export async function POST(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const formData = await request.formData()
    const datos = leerDatosMultipart(formData)
    if (!datos.ok) return Response.json({ error: datos.error }, { status: 400 })
    const validation = validate(PagoCrearSchema, datos.data)
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const pago = validation.data

    const comprobante = formData.get('comprobante')
    const archivo = comprobante instanceof File && comprobante.size > 0 ? comprobante : null
    if (archivo) {
      if (!TIPOS_COMPROBANTE.includes(archivo.type) && !/\.(pdf|jpe?g|png|heic|heif|webp)$/i.test(archivo.name)) {
        return Response.json({ error: 'El comprobante debe ser PDF o imagen' }, { status: 400 })
      }
      if (archivo.size > MAX_FILE_SIZE) return Response.json({ error: MENSAJE_LIMITE }, { status: 400 })
    }

    const { status, body } = await registrarPago({
      lado: pago.lado,
      lineas: pago.lineas.map((l) => ({ id: l.id, monto: l.monto, saldo_esperado: l.saldo_esperado ?? null })),
      tipoPago: pago.tipo_pago,
      fechaPago: pago.fecha_pago,
      notas: pago.notas ?? null,
      operationId: pago.operation_id,
      comprobante: archivo,
      usuario: authResult.session?.user?.email ?? null,
      route: ROUTE,
      scope: `cuentas-pagos:${pago.lado}:registrar-pago`,
      resolver: async () => {
        const r = await resolverContraparteDeDestinos(pago.lado, pago.lineas.map((l) => l.id))
        if (!r.ok) return { status: r.status, body: r.body }
        return { carpeta: carpetaContraparte(pago.lado, r.contraparte.nombre) }
      },
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
