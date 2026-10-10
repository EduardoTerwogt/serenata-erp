import { CuentaPagar, RegimenFiscal } from '@/lib/types'

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
  /** Lo que es del SAT: IVA neto a enterar + retenciones de IVA e ISR (#140). */
  sat_total: number
  /**
   * Control del cuadre (#140): cobros − pagos (con IVA) − SAT − utilidad bruta. 0 = cuadra;
   * distinto de 0 = una factura fuera de tolerancia o un dato roto (la UI avisa si |valor| > 0.01).
   */
  cuadre_diferencia: number
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
// (B3).
export type CuentaPagarCierreInput = Pick<CuentaPagar, 'id' | 'grupo_id' | 'costo_total' | 'responsable_id'> &
  Partial<Pick<CuentaPagar, 'responsable_nombre' | 'grupo_monto_total' | 'grupo_total_a_transferir'>> & {
    proveedor_regimen_fiscal?: RegimenFiscal | null
  }
