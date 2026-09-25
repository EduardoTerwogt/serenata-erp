/**
 * Forma de la vista previa de una orden de pago: la arma
 * `preview-cuentas.ts` (Rediseño de Cuentas B6) y la imprime el PDF
 * (`lib/server/pdf/orden-pago-pdf.ts`).
 */
import type { OrdenPagoCandidato } from '@/lib/server/repositories/cuentas-pagar'
import type { CruceOrden } from '@/lib/shared/cuentas/ordenes-tipos'

export interface OrdenPagoPreviewItem {
  descripcion: string
  cantidad: number
  monto: number
  cuenta_id: string
}

export interface OrdenPagoPreviewEvento {
  cotizacion_folio: string
  proyecto: string
  /** Fecha de entrega de la cotización (yyyy-mm-dd); se imprime en el PDF. */
  fecha_entrega: string | null
  items: OrdenPagoPreviewItem[]
  subtotal: number
}

export interface OrdenPagoPreviewResponsable {
  responsable: {
    id: string
    nombre: string
    correo: string | null
    telefono: string | null
    banco: string | null
    clabe: string | null
  }
  eventos: OrdenPagoPreviewEvento[]
  total_responsable: number
  /** Rediseño de Cuentas B6 (supuesto 14): cruce fiscal del responsable; el PDF lo imprime si viene. */
  cruce?: CruceOrden
}

export interface OrdenPagoPreviewResult {
  responsables: OrdenPagoPreviewResponsable[]
  resumen: {
    responsables: number
    eventos: number
    items_totales: number
    total_general: number
    /** B6 (supuesto 14, D20): total general a transferir; si viene, es el total de la orden en el PDF. */
    total_transferir?: number
  }
  cuentas_ids: string[]
  /**
   * Lo que se manda a `generar_orden_pago`: un grupo o una suelta por
   * candidato, con el saldo que este mismo preview imprime en el PDF.
   */
  candidatos: OrdenPagoCandidato[]
}
