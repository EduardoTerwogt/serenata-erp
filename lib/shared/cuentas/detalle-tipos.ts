/**
 * Rediseño de Cuentas B5 (docs/PLAN.md §7 B5, U2): contrato del detalle de un
 * concepto (cobro, grupo de proveedor o cuenta suelta). Lo arma
 * lib/server/cuentas/detalle.ts y lo devuelven los endpoints de documentos
 * existentes (campo `detalle`). El estado y el siguiente paso salen de la
 * misma derivación que la lista (concepto.ts).
 */
import type { ConceptoDerivado, EstadoComplementoPago, MetodoPagoCfdi } from '@/lib/shared/cuentas/concepto'
import type { RegimenFiscal } from '@/lib/types'

export interface DocumentoDetalle {
  id: string
  tipo: string
  archivo_url: string | null
  archivo_nombre: string | null
  fecha_carga: string
  /** Solo XML (T1): pendiente / validado / revision. */
  estado_validacion: 'pendiente' | 'validado' | 'revision' | null
  detalle_validacion: string | null
}

export interface ProyectoDetalleCorto {
  id: string
  nombre: string
  fecha_entrega: string | null
}

export interface PagoCobroDetalle {
  id: string
  fecha: string
  tipo: string
  monto: number
  comprobante_url: string | null
  notas: string | null
  /** D16, D27, V4: complemento de este pago. */
  complemento: {
    requiere: boolean
    estado: EstadoComplementoPago | 'no_aplica'
    xml: DocumentoDetalle | null
    pdf: DocumentoDetalle | null
  }
}

export interface DetalleCobro {
  tipo: 'cobro'
  id: string
  folio: string | null
  cotizacion_id: string | null
  proyecto: ProyectoDetalleCorto | null
  cliente: string
  total: number
  pagado: number
  fecha_factura: string | null
  fecha_vencimiento: string | null
  notas: string | null
  metodo: MetodoPagoCfdi | null
  factura_xml: DocumentoDetalle | null
  factura_pdf: DocumentoDetalle | null
  pagos: PagoCobroDetalle[]
  concepto: ConceptoDerivado
}

export interface PagoProveedorDetalle {
  id: string
  fecha: string
  tipo: string
  /** Total a transferir (D3). */
  monto: number
  comprobante_url: string | null
  notas: string | null
  /** Pago anterior a B2: su monto transferido es estimado (supuesto 12). */
  estimado: boolean
}

export interface DetallePago {
  tipo: 'pago'
  objetivo: 'grupo' | 'cuenta'
  id: string
  proyecto: ProyectoDetalleCorto | null
  cotizacion_id: string | null
  responsable: {
    id: string | null
    nombre: string
    regimen_fiscal: RegimenFiscal | null
    correo: string | null
    telefono: string | null
    banco: string | null
    clabe: string | null
  }
  /** Renglones: 1 en una suelta, n en un grupo (se reasignan uno por uno, D21). */
  items: { cuenta_id: string; item_id: string | null; descripcion: string; cantidad: number | null; neto: number; pagado: number }[]
  /** Costo total · neto al proveedor (D29). */
  neto: number
  /** Total a transferir: snapshot del CFDI o estimado por régimen (supuesto 6). */
  total: number
  total_estimado: boolean
  pagado: number
  cruce: { neto: number; iva: number; iva_retenido: number; isr_retenido: number; total: number }
  factura_xml: DocumentoDetalle | null
  factura_pdf: DocumentoDetalle | null
  /** Comprobantes sueltos (documentos COMPROBANTE_PAGO previos a B2). */
  comprobantes: DocumentoDetalle[]
  pagos: PagoProveedorDetalle[]
  orden: { id: string; nombre: string; pdf_url: string | null; estado: string; fecha: string } | null
  /** Estado guardado del grupo ('ABIERTO' permite reasignar, D21). */
  estado_bd: string
  concepto: ConceptoDerivado
}

export type DetalleConcepto = DetalleCobro | DetallePago
