import { EstadoCuentaCobrar, OrdenPago, CuentaPagar } from '@/lib/types'

export interface CuentaCobrarStatusInput {
  montoPagado: number
  montoTotal: number
  fechaVencimiento?: string | null
  isFacturada?: boolean
  today?: Date
}

export function calcularSaldoPendiente(total: number, pagado: number | null | undefined): number {
  const saldo = Number(total || 0) - Number(pagado || 0)
  return saldo > 0 ? Number(saldo.toFixed(2)) : 0
}

export function calcularEstadoCuentaCobrarDetallado({
  montoPagado,
  montoTotal,
  fechaVencimiento,
  isFacturada = true,
  today = new Date(),
}: CuentaCobrarStatusInput): EstadoCuentaCobrar {
  const total = Number(montoTotal || 0)
  const pagado = Number(montoPagado || 0)
  const saldoPendiente = calcularSaldoPendiente(total, pagado)

  if (saldoPendiente <= 0 && total > 0) return 'PAGADO'

  if (fechaVencimiento) {
    const hoy = today.toISOString().split('T')[0]
    if (fechaVencimiento < hoy && saldoPendiente > 0) return 'VENCIDO'
  }

  if (!isFacturada) return 'FACTURA_PENDIENTE'
  if (pagado > 0) return 'PARCIALMENTE_PAGADO'
  return 'FACTURADO'
}

export function calcularEstadoCuentaCobrarLegacy(montoPagado: number, montoTotal: number): EstadoCuentaCobrar {
  return calcularEstadoCuentaCobrarDetallado({
    montoPagado,
    montoTotal,
    isFacturada: true,
  })
}

export function calcularEstadoOrdenPago(
  cuentas: Pick<CuentaPagar, 'x_pagar' | 'monto_pagado'>[]
): OrdenPago['estado'] {
  if (cuentas.length === 0) return 'GENERADA'

  const allPaid = cuentas.every((cuenta) => Number(cuenta.monto_pagado || 0) >= Number(cuenta.x_pagar || 0))
  if (allPaid) return 'COMPLETADA'

  const anyPaid = cuentas.some((cuenta) => Number(cuenta.monto_pagado || 0) > 0)
  if (anyPaid) return 'PARCIALMENTE_PAGADA'

  return 'GENERADA'
}
