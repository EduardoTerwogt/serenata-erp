import { RegimenFiscal } from '@/lib/types'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'

export interface CrucePagoProveedor {
  neto: number
  iva: number
  retencionIva: number
  retencionIsr: number
  totalATransferir: number
}

// Fase 5.3 Bloque 3: mismo cálculo que lib/server/validation/factura-fiscal.ts
// (y que sn5Fiscal del skill de diseño), usable en cliente y servidor.
// Delega en calcularEjemploFactura (fuente de verdad única de
// moral/física/resico) en vez de reimplementar las tasas por tercera vez.
// Rediseño de Cuentas B1 (S6): vive en lib/shared/cuentas para que
// concepto.ts lo use sin depender de la UI que retira B8.
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
