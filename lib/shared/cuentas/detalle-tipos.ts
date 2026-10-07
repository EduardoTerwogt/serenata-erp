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

/** B7: documento dado de baja (quitado o reemplazado); queda en el historial. */
export interface DocumentoBaja {
  id: string
  tipo: string
  archivo_nombre: string | null
  archivo_url: string | null
  eliminado_at: string
  motivo: string | null
}

/** B7 (R8): pago anulado; no cuenta en saldos, queda en el historial con su motivo. */
export interface PagoAnulado {
  id: string
  fecha: string
  monto: number
  anulado_at: string
  motivo: string | null
}

/** B7: lo que el detalle necesita para ofrecer correcciones (usuario de Cuentas, con las cuentas reabiertas; P14). */
export interface CorreccionesDetalle {
  reabierta: boolean
  bajas: DocumentoBaja[]
  pagos_anulados: PagoAnulado[]
}

export interface ProyectoDetalleCorto {
  id: string
  nombre: string
  fecha_entrega: string | null
}

/** D16, D27, V4 (#123, P9): complemento de un pago, uno por factura y por pago. */
export interface ComplementoPagoDetalle {
  requiere: boolean
  estado: EstadoComplementoPago | 'no_aplica'
  xml: DocumentoDetalle | null
  pdf: DocumentoDetalle | null
}

export interface PagoCobroDetalle {
  /** Id de la CABECERA del pago (`pagos`): el que usan anular y corregir. */
  id: string
  fecha: string
  tipo: string
  /** Lo aplicado a ESTA cuenta (un pago puede cubrir varias, P7). */
  monto: number
  comprobante_url: string | null
  notas: string | null
  /** Cuántas cuentas cubre el mismo pago (>1 = pago compartido, P20). */
  lineas: number
  complemento: ComplementoPagoDetalle
}

export interface DetalleCobro {
  tipo: 'cobro'
  id: string
  folio: string | null
  cotizacion_id: string | null
  proyecto: ProyectoDetalleCorto | null
  cliente: string
  /** Ficha del cliente (null si la cotización solo guardó el nombre): contraparte de la ventana Registrar pago (P22). */
  cliente_id: string | null
  total: number
  pagado: number
  fecha_factura: string | null
  fecha_vencimiento: string | null
  notas: string | null
  metodo: MetodoPagoCfdi | null
  factura_xml: DocumentoDetalle | null
  factura_pdf: DocumentoDetalle | null
  /** Cuántas cuentas cubre la misma factura (>1 = factura compartida, P20); 0 sin factura. */
  factura_cuentas: number
  pagos: PagoCobroDetalle[]
  concepto: ConceptoDerivado
  correcciones: CorreccionesDetalle
}

export interface PagoProveedorDetalle {
  /** Id de la CABECERA del pago (`pagos`): el que usan anular, corregir y adjuntar el comprobante. */
  id: string
  fecha: string
  tipo: string
  /** Total a transferir (D3). */
  monto: number
  comprobante_url: string | null
  notas: string | null
  /** Pago anterior a B2: su monto transferido es estimado (supuesto 12). */
  estimado: boolean
  /** Cuántos grupos cubre el mismo pago (>1 = pago compartido, P20). */
  lineas: number
  /** P11: la factura PPD del proveedor exige un complemento por pago. */
  complemento: ComplementoPagoDetalle
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
  /** Método de pago de la factura del proveedor (null = desconocido). */
  metodo: MetodoPagoCfdi | null
  /** Comprobantes sueltos (documentos COMPROBANTE_PAGO previos a B2). */
  comprobantes: DocumentoDetalle[]
  pagos: PagoProveedorDetalle[]
  orden: { id: string; nombre: string; pdf_url: string | null; estado: string; fecha: string } | null
  /** Estado guardado del grupo ('ABIERTO' permite reasignar, D21). */
  estado_bd: string
  concepto: ConceptoDerivado
  correcciones: CorreccionesDetalle
}

export type DetalleConcepto = DetalleCobro | DetallePago
