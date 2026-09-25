/**
 * Rediseño de Cuentas B6 (§5.2, supuesto 6): cruce fiscal de una orden. Lo
 * usan el preview del servidor y el pie del modal (totales de lo marcado).
 */
import { round2 } from '@/lib/shared/decimal'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'
import type { CruceOrden, PreviewOrden } from '@/lib/shared/cuentas/ordenes-tipos'
import type { RegimenFiscal } from '@/lib/types'

/** Cruce de un saldo: neto, IVA y retenciones por régimen; total del snapshot del CFDI si existe. */
export function cruceSaldo(saldo: number, regimen: RegimenFiscal | null, totalATransferir: number | null, transferido: number | null): CruceOrden {
  const e = calcularEjemploFactura(saldo, regimen)
  const total = totalATransferir == null ? e.total : round2(Number(totalATransferir) - Number(transferido ?? 0))
  return { subtotal: e.subtotal, iva: e.iva_trasladado, iva_retenido: e.iva_retenido, isr_retenido: e.isr_retenido, total }
}

/** Suma de cruces por grupo (nunca retenciones sobre la suma, §5.2). */
export function sumarCruces(cruces: CruceOrden[]): CruceOrden {
  const s = (k: keyof CruceOrden) => round2(cruces.reduce((acc, c) => acc + c[k], 0))
  return { subtotal: s('subtotal'), iva: s('iva'), iva_retenido: s('iva_retenido'), isr_retenido: s('isr_retenido'), total: s('total') }
}

/** Totales de los responsables incluidos (todos si `incluidos` no viene). */
export function totalesOrden(preview: PreviewOrden, incluidos?: ReadonlySet<string>) {
  const rs = preview.responsables.filter((r) => !incluidos || incluidos.has(r.clave))
  return {
    responsables: rs.length,
    cuentas: rs.reduce((s, r) => s + r.proyectos.length, 0),
    cruce: sumarCruces(rs.map((r) => r.cruce)),
  }
}
