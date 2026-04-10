import { requireSection } from '@/lib/api-auth'
import { getCuentasPagar, getDocumentosCuentaPagar, getOrdenPagoById } from '@/lib/db'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const cuentas = await getCuentasPagar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    }

    const documentos = await getDocumentosCuentaPagar(id)
    const ordenPago = cuenta.orden_pago_id ? await getOrdenPagoById(cuenta.orden_pago_id).catch(() => null) : null

    return Response.json({
      cuenta,
      documentos,
      orden_pago: ordenPago,
      resumen: {
        monto_pagado: cuenta.monto_pagado || 0,
        saldo_pendiente: calcularSaldoPendiente(cuenta.x_pagar, cuenta.monto_pagado || 0),
      },
    })
  } catch (error) {
    console.error('[cuentas-pagar/documentos]', error)
    return Response.json({ error: 'Error obteniendo documentos' }, { status: 500 })
  }
}
