// Rediseño de Cuentas B1 (docs/PLAN.md, S6): vive en lib/shared para que
// la derivación de conceptos (concepto.ts) la use igual en servidor y
// cliente. "Hoy" es la fecha de negocio en CDMX, nunca la UTC del servidor.
import { EstadoCuentaCobrar } from '@/lib/types'
import { round2 } from '@/lib/shared/decimal'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'

export interface CuentaCobrarStatusInput {
  montoPagado: number
  montoTotal: number
  fechaVencimiento?: string | null
  isFacturada?: boolean
  /** "Hoy" de negocio (YYYY-MM-DD, hora CDMX). Si falta, se usa hoyCdmx(). */
  hoy?: string
}

export function calcularSaldoPendiente(total: number, pagado: number | null | undefined): number {
  const saldo = Number(total || 0) - Number(pagado || 0)
  return saldo > 0 ? round2(saldo) : 0
}

export function calcularEstadoCuentaCobrarDetallado({
  montoPagado,
  montoTotal,
  fechaVencimiento,
  isFacturada = true,
  hoy = hoyCdmx(),
}: CuentaCobrarStatusInput): EstadoCuentaCobrar {
  const total = Number(montoTotal || 0)
  const pagado = Number(montoPagado || 0)
  const saldoPendiente = calcularSaldoPendiente(total, pagado)

  if (saldoPendiente <= 0 && total > 0) return 'PAGADO'

  if (fechaVencimiento && fechaVencimiento < hoy && saldoPendiente > 0) return 'VENCIDO'

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
