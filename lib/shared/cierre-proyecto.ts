import { calcularEjemploFactura } from './factura-fiscal'
import { CuentaPagar, RegimenFiscal } from '@/lib/types'

const TASA_ISR_SERENATA = 0.30

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface QuienCuantoCuando {
  /** grupo_id del grupo de facturación, o id de la cuenta suelta: liga el cierre con sus pagos. */
  clave: string
  proveedor_id: string | null
  proveedor_nombre: string
  regimen_fiscal: RegimenFiscal | null
  neto: number
  iva_trasladado: number
  iva_retenido: number
  isr_retenido: number
  total_a_transferir: number
  // B2 (H10, supuesto 6): true cuando total_a_transferir es el snapshot del
  // CFDI validado (o el histórico estimado del backfill), false cuando es el
  // estimado en vivo con el régimen del proveedor.
  total_es_snapshot: boolean
}

export interface CierreProyecto {
  quien_cuanto_cuando: QuienCuantoCuando[]
  iva_retenido_total: number
  isr_retenido_total: number
  iva_cobrado: number
  iva_pagado: number
  iva_neto_a_enterar: number
  utilidad_bruta: number
  isr_serenata_estimado: number
  utilidad_neta: number
  // Igual a utilidad_neta -- nombre pedido en docs/PLAN.md para la vista
  // "Cierre del proyecto" ("Utilidad libre estimada" = Utilidad Bruta − ISR
  // estimado).
  utilidad_libre_estimada: number
}

// Solo los campos que usa el cierre: así lo alimentan tanto CuentaPagar
// completa (vista actual) como las filas compactas de la lectura por periodo
// (B3, lib/server/cuentas/periodo.ts).
export type CuentaPagarCierreInput = Pick<CuentaPagar, 'id' | 'grupo_id' | 'x_pagar' | 'responsable_id' | 'responsable_nombre'> &
  Partial<Pick<CuentaPagar, 'grupo_monto_total' | 'grupo_total_a_transferir' | 'total_a_transferir'>> & {
    proveedor_regimen_fiscal?: RegimenFiscal | null
  }

type CuentaPagarConRegimen = CuentaPagarCierreInput

/**
 * Agrega el cierre fiscal de un proyecto: quién le corresponde a cada
 * proveedor (por grupo de facturación, nunca por renglón individual) y la
 * utilidad bruta/neta de Serenata. El desglose de IVA/retenciones de cada
 * proveedor SIEMPRE pasa por calcularEjemploFactura -- nunca una tasa plana
 * a nivel proyecto (docs/PLAN.md, riesgo P1 de Bloque 2).
 *
 * utilidad_bruta deriva solo de margenTotalProyecto/feeAgenciaProyecto
 * (columnas de cotizaciones, nunca tocadas por retenciones de proveedores)
 * -- "Utilidad antes de impuestos" = "Utilidad después de retenciones" se
 * cumple por construcción, no por coincidencia numérica.
 */
export function calcularCierreProyecto(
  cuentasPagar: CuentaPagarConRegimen[],
  margenTotalProyecto: number,
  feeAgenciaProyecto: number,
  ivaTotalProyecto: number
): CierreProyecto {
  // El cruce fiscal se calcula sobre el monto total del grupo, nunca sobre
  // el renglón individual (docs/decisions/006).
  const porGrupo = new Map<string, CuentaPagarConRegimen[]>()
  for (const cuenta of cuentasPagar) {
    const key = cuenta.grupo_id ?? cuenta.id
    porGrupo.set(key, [...(porGrupo.get(key) ?? []), cuenta])
  }

  const quien_cuanto_cuando: QuienCuantoCuando[] = Array.from(porGrupo.entries()).map(([clave, items]) => {
    const representante = items[0]
    const monto = representante.grupo_monto_total ?? items.reduce((sum, item) => sum + (item.x_pagar || 0), 0)
    const regimenFiscal = representante.proveedor_regimen_fiscal ?? null
    const r = calcularEjemploFactura(monto, regimenFiscal)
    // H10: con factura validada manda el Total del CFDI (el mismo que usa el
    // saldo del pago); sin factura, el estimado. IVA y retenciones siguen
    // estimados por régimen: el CFDI solo guarda su Total.
    const snapshot = representante.grupo_id ? representante.grupo_total_a_transferir : representante.total_a_transferir
    const tieneSnapshot = snapshot != null
    return {
      clave,
      proveedor_id: representante.responsable_id,
      proveedor_nombre: representante.responsable_nombre,
      regimen_fiscal: regimenFiscal,
      neto: r.subtotal,
      iva_trasladado: r.iva_trasladado,
      iva_retenido: r.iva_retenido,
      isr_retenido: r.isr_retenido,
      total_a_transferir: tieneSnapshot ? round2(Number(snapshot)) : r.total,
      total_es_snapshot: tieneSnapshot,
    }
  })

  const iva_retenido_total = round2(quien_cuanto_cuando.reduce((sum, q) => sum + q.iva_retenido, 0))
  const isr_retenido_total = round2(quien_cuanto_cuando.reduce((sum, q) => sum + q.isr_retenido, 0))
  const iva_pagado = round2(quien_cuanto_cuando.reduce((sum, q) => sum + q.iva_trasladado, 0))
  const iva_neto_a_enterar = round2(ivaTotalProyecto - iva_pagado)

  const utilidad_bruta = round2(margenTotalProyecto + feeAgenciaProyecto)
  const isr_serenata_estimado = round2(Math.max(0, utilidad_bruta) * TASA_ISR_SERENATA)
  const utilidad_neta = round2(utilidad_bruta - isr_serenata_estimado)

  return {
    quien_cuanto_cuando,
    iva_retenido_total,
    isr_retenido_total,
    iva_cobrado: ivaTotalProyecto,
    iva_pagado,
    iva_neto_a_enterar,
    utilidad_bruta,
    isr_serenata_estimado,
    utilidad_neta,
    utilidad_libre_estimada: utilidad_neta,
  }
}
