import { RegimenFiscal } from '@/lib/types'

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
// ocurre en el servidor al subir el XML.
export function calcularCrucePagoProveedor(neto: number, regimenFiscal: RegimenFiscal | null | undefined): CrucePagoProveedor {
  const iva = neto * 0.16
  if (regimenFiscal !== 'fisica') {
    return { neto, iva, retencionIva: 0, retencionIsr: 0, totalATransferir: neto + iva }
  }
  const retencionIva = neto * (2 / 3) * 0.16
  const retencionIsr = neto * 0.10
  return { neto, iva, retencionIva, retencionIsr, totalATransferir: neto + iva - retencionIva - retencionIsr }
}
