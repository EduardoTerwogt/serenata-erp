import { RegimenFiscal } from '@/lib/types'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'

export function formatCuentasCurrency(value: number) {
  return (value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

export interface CrucePagoProveedor {
  neto: number
  iva: number
  retencionIva: number
  retencionIsr: number
  totalATransferir: number
}

// Fase 5.3 Bloque 3: mismo cálculo que lib/server/validation/factura-fiscal.ts
// (y que sn5Fiscal del skill de diseño), del lado del cliente, solo para
// mostrar el desglose al usuario -- la validación real de la factura ya
// ocurre en el servidor al subir el XML. Delega en calcularEjemploFactura
// (fuente de verdad única de moral/física/resico) en vez de reimplementar
// las tasas por tercera vez.
export function calcularCrucePagoProveedor(neto: number, regimenFiscal: RegimenFiscal | null | undefined): CrucePagoProveedor {
  const r = calcularEjemploFactura(neto, regimenFiscal)
  return {
    neto: r.subtotal,
    iva: r.iva_trasladado,
    retencionIva: r.iva_retenido,
    retencionIsr: r.isr_retenido,
    totalATransferir: r.total,
  }
}
