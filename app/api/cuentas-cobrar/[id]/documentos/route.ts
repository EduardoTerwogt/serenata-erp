import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, getDocumentosCuentaCobrar, getPagosComprobantesByCuenta } from '@/lib/db'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const cuentas = await getCuentasCobrar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por cobrar no encontrada' }, { status: 404 })
    }

    const documentos = await getDocumentosCuentaCobrar(id)
    const pagos = await getPagosComprobantesByCuenta(id)
    const totalPagado = pagos.reduce((sum, pago) => sum + pago.monto, 0)

    return Response.json({
      cuenta,
      documentos,
      pagos,
      resumen: {
        total_pagado: totalPagado,
        saldo_pendiente: calcularSaldoPendiente(cuenta.monto_total, totalPagado),
      },
    })
  } catch (error) {
    console.error('[cuentas-cobrar/documentos]', error)
    return Response.json({ error: 'Error obteniendo documentos' }, { status: 500 })
  }
}
