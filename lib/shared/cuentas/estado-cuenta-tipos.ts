/**
 * #123 (B3, P15): contrato de `estado_cuenta` y `facturas_candidatos`, compartido entre la ruta y las ventanas de
 * Acciones. Los montos llegan de SQL (que decide saldos, estados y umbrales, T6): el cliente solo los pinta.
 */
export type LadoCuentas = 'cobro' | 'proveedor'

export interface ConceptoEstadoCuenta {
  key: string
  /** 'cobro' (cuenta de cobro) o 'grupo' (grupo de proveedor). */
  objetivo: 'cobro' | 'grupo'
  /** Id de la cuenta de cobro o del grupo: lo que viaja en las líneas de un pago. */
  id: string
  proyecto_id: string | null
  proyecto_nombre: string | null
  cotizacion_id: string | null
  folio: string | null
  concepto: string
  total: number
  pagado: number
  saldo: number
  estado: string
  paso: string | null
  venc_dias: number | null
  fecha_vencimiento: string | null
  resuelto: boolean
}

export interface FacturaEstadoCuenta {
  id: string
  uuid_cfdi: string | null
  total_cfdi: number | null
  metodo_pago: 'PUE' | 'PPD' | null
  estado_validacion: string | null
  detalle_validacion: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  fecha_carga: string | null
  fecha_factura: string | null
  fecha_vencimiento: string | null
  total: number
  pagado: number
  saldo: number
  /** Los conceptos que cubre, de la cotización más antigua a la más reciente. */
  conceptos: ConceptoEstadoCuenta[]
}

export interface AplicacionPago {
  destino_id: string
  factura_id: string | null
  folio: string | null
  cotizacion_id: string | null
  monto: number
}

export interface ComplementoDePago {
  id: string
  tipo: 'COMPLEMENTO_PAGO' | 'COMPLEMENTO_PAGO_PDF'
  estado: string | null
  factura_id: string | null
  archivo_url: string | null
  monto_pagado: number | null
}

export interface PagoEstadoCuenta {
  id: string
  fecha_pago: string
  tipo_pago: string
  comprobante_url: string | null
  archivo_nombre: string | null
  notas: string | null
  anulado: boolean
  anulado_motivo: string | null
  monto: number
  aplicaciones: AplicacionPago[]
  complementos: ComplementoDePago[]
}

export interface EstadoCuentaRespuesta {
  lado: LadoCuentas
  hoy: string
  contraparte: { id: string; nombre: string; rfc: string | null } | null
  resumen: {
    total: number
    pagado: number
    saldo: number
    vencido: number
    facturas: number
    sin_factura: number
    sin_factura_saldo: number
  }
  facturas: FacturaEstadoCuenta[]
  sin_factura: ConceptoEstadoCuenta[]
  pagos: PagoEstadoCuenta[]
}

export interface CandidatoFacturaCobro {
  cuenta_id: string
  folio: string | null
  cotizacion_id: string | null
  proyecto_id: string | null
  proyecto: string | null
  monto_total: number
  monto_pagado: number
  saldo: number
  fecha_entrega: string | null
}

export interface CandidatoFacturaProveedor {
  grupo_id: string
  proyecto_id: string
  proyecto: string | null
  estado: string
  monto_total: number
  conceptos: number
  fecha_entrega: string | null
}
