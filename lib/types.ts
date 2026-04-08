export type EstadoCotizacion = 'BORRADOR' | 'ENVIADA' | 'APROBADA'
export type EstadoProyecto = 'PREPRODUCCION' | 'RODAJE' | 'POSTPRODUCCION' | 'FINALIZADO'
export type EstadoPago = 'PENDIENTE' | 'PAGADO' | 'PARCIAL'

export interface Responsable {
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
  // Google Workspace metadata — null until each integration is activated
  drive_file_id?: string | null
  calendar_event_id?: string | null
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
  estado: EstadoPago
  fecha_pago: string | null
  metodo_pago: string | null
  notas: string | null
}

export interface CuentaCobrar {
  id: string
  cotizacion_id: string
  cliente: string
  proyecto: string
  monto_total: number
  estado: EstadoPago | 'VENCIDO'
  fecha_vencimiento: string | null
  fecha_pago: string | null
  notas: string | null
}
