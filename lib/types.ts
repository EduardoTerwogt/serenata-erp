export type EstadoCotizacion = 'BORRADOR' | 'EMITIDA' | 'APROBADA' | 'CANCELADA'
export type EstadoProyecto = 'PREPRODUCCION' | 'RODAJE' | 'POSTPRODUCCION' | 'FINALIZADO'
export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'PARCIAL'

export type EstadoCuentaCobrar = 'FACTURA_PENDIENTE' | 'FACTURADO' | 'PARCIALMENTE_PAGADO' | 'PAGADO' | 'VENCIDO'
export type EstadoCuentaPagar = 'PENDIENTE' | 'EN_PROCESO_PAGO' | 'PAGADO'
export type TipoPago = 'TRANSFERENCIA' | 'EFECTIVO'

export type RegimenFiscal = 'moral' | 'fisica'

// Renombrado de "Responsable" a "Proveedor" (Fase 5.3, Bloque 0): la tabla
// responsables -> proveedores. Serenata contrata por proyecto (sin nómina),
// así que hoy no hace falta distinguir interno/externo; cuando exista
// personal en nómina será una sección aparte.
export interface Proveedor {
  id: string
  nombre: string
  telefono: string | null
  correo: string | null
  banco: string | null
  clabe: string | null
  roles: string[]
  notas: string | null
  activo: boolean
  created_at: string
  // Escenario fiscal del proveedor (Fase 5.1/5.3): 'moral' = IVA 16% acreditable sin
  // retencion; 'fisica' = persona fisica con honorarios, retencion IVA 2/3 + ISR 10%.
  // null = no capturado aun -> se trata como 'moral' por default en los calculos.
  regimen_fiscal: RegimenFiscal | null
}

export interface HistorialResponsable {
  id: string
  responsable_id: string
  cotizacion_id: string | null
  proyecto_id: string | null
  proyecto_nombre: string
  cliente: string
  fecha_evento: string | null
  rol_en_proyecto: string | null
  x_pagar: number
  created_at: string
}

// Log append-only de reasignaciones de responsable en items_cotizacion.
// No confundir con HistorialResponsable (snapshot de historial de proyectos
// por responsable, tabla distinta).
export interface HistorialCambioResponsableItem {
  id: string
  item_id: string
  cotizacion_id: string
  responsable_anterior_id: string | null
  responsable_anterior_nombre: string | null
  responsable_nuevo_id: string | null
  responsable_nuevo_nombre: string | null
  changed_at: string
  changed_by: string | null
}

export interface ItemCotizacion {
  id: string
  cotizacion_id: string
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
  responsable_nombre: string | null
  responsable_id: string | null
  x_pagar: number
  margen: number
  orden: number
  notas?: string | null
}

export interface Producto {
  id: string
  descripcion: string
  categoria: string | null
  precio_unitario: number
  x_pagar_sugerido: number
  activo: boolean
  created_at: string
}

export interface ServiceTemplateItem {
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  x_pagar: number
  responsable_nombre?: string | null
  responsable_id?: string | null
  producto_id?: string | null
}

export interface ServiceTemplate {
  id: string
  nombre: string
  descripcion: string | null
  items: ServiceTemplateItem[]
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Cliente {
  id: string
  nombre: string
  proyectos: string[]
  activo: boolean
  created_at: string
}

export interface Cotizacion {
  id: string
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  fecha_cotizacion: string | null
  tipo: 'PRINCIPAL' | 'COMPLEMENTARIA'
  es_complementaria_de: string | null
  estado: EstadoCotizacion
  subtotal: number
  fee_agencia: number
  general: number
  iva: number
  total: number
  margen_total: number
  utilidad_total: number
  porcentaje_fee?: number
  iva_activo?: boolean
  descuento_tipo?: 'monto' | 'porcentaje'
  descuento_valor?: number
  created_at: string
  items?: ItemCotizacion[]
  drive_file_id?: string | null
  calendar_event_id?: string | null
  notas_internas?: string | null
}

export interface Proyecto {
  id: string
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  horarios: string | null
  punto_encuentro: string | null
  estado: EstadoProyecto
  notas: string | null
  created_at: string
  cotizacion?: Cotizacion
}

export interface CuentaPagar {
  id: string
  cotizacion_id: string
  proyecto_id: string
  proyecto_nombre?: string
  item_id: string | null
  responsable_id: string | null
  responsable_nombre: string
  item_descripcion: string | null
  cantidad: number
  x_pagar: number
  margen: number
  telefono: string | null
  correo: string | null
  clabe: string | null
  banco: string | null
  estado: EstadoCuentaPagar
  folio?: string
  fecha_factura?: string | null
  fecha_vencimiento?: string | null
  monto_pagado?: number
  fecha_pago: string | null
  metodo_pago: string | null
  orden_pago_id?: string | null
  notas: string | null
  updated_at?: string
  created_at?: string
}

export interface CuentaCobrar {
  id: string
  cotizacion_id: string
  proyecto_id: string | null
  cliente: string
  proyecto: string
  monto_total: number
  estado: EstadoCuentaCobrar
  folio?: string
  fecha_factura?: string | null
  fecha_vencimiento?: string | null
  monto_pagado?: number
  fecha_pago: string | null
  notas: string | null
  created_at?: string
  updated_at?: string
}

export interface PagoComprobante {
  id: string
  cuentas_cobrar_id: string
  monto: number
  tipo_pago: TipoPago
  fecha_pago: string
  comprobante_url: string
  archivo_nombre: string
  notas?: string | null
  created_at: string
}

export type EstadoValidacionDocumento = 'pendiente' | 'validado' | 'revision'

export interface DocumentoCuentaCobrar {
  id: string
  cuentas_cobrar_id: string
  tipo: 'FACTURA_PDF' | 'FACTURA_XML' | 'COMPLEMENTO_PAGO' | 'COMPLEMENTO_PAGO_PDF' | 'OTRO'
  archivo_url: string
  archivo_nombre: string
  archivo_size?: number
  fecha_carga: string
  created_at: string
  estado_validacion: EstadoValidacionDocumento
  detalle_validacion?: string | null
}

export interface DocumentoCuentaPagar {
  id: string
  cuentas_pagar_id: string
  tipo: 'FACTURA_PROVEEDOR' | 'FACTURA_PROVEEDOR_XML' | 'COMPROBANTE_PAGO' | 'OTRO'
  archivo_url: string
  archivo_nombre: string
  fecha_carga: string
  created_at: string
  estado_validacion: EstadoValidacionDocumento
  detalle_validacion?: string | null
}

export interface OrdenPago {
  id: string
  fecha_generacion: string
  pdf_url: string
  pdf_nombre: string
  estado: 'GENERADA' | 'PARCIALMENTE_PAGADA' | 'COMPLETADA'
  total_monto: number
  notas?: string | null
  created_by: string
  created_at: string
  updated_at?: string
}
