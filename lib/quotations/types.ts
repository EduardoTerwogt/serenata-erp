import { Cotizacion, Proveedor } from '@/lib/types'

export type DescuentoTipo = 'monto' | 'porcentaje'
export type QuotationStatus = 'BORRADOR' | 'EMITIDA' | 'APROBADA' | 'CANCELADA'
export type QuotationKind = 'PRINCIPAL' | 'COMPLEMENTARIA'

export interface QuotationFormItem {
  id?: string
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number | ''
  responsable_id: string
  responsable_nombre: string
  x_pagar: number | ''
  importe?: number
  margen?: number
}

export interface QuotationFormValues {
  cliente: string
  proyecto: string
  fecha_entrega: string
  locacion: string
  items: QuotationFormItem[]
}

export interface QuotationTotalsInput {
  items: QuotationFormItem[]
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: DescuentoTipo
  descuento_valor: number
}

export interface QuotationComputedItem extends Omit<QuotationFormItem, 'precio_unitario' | 'x_pagar'> {
  precio_unitario: number
  x_pagar: number
  importe: number
  margen: number
}

export interface QuotationTotals {
  subtotal: number
  fee_agencia: number
  general: number
  descuento: number
  iva: number
  total: number
  margen_total: number
  utilidad_total: number
}

// Fase 5.1: panel "Impuestos (estimado)". IVA pagado es siempre 16% del X Pagar de
// cada partida, sin importar el regimen fiscal del responsable -- la retencion no
// reduce lo acreditable para Serenata, solo cambia el neto que recibe el proveedor
// (documento maestro seccion 3; decision confirmada 2026-09-06).
export interface EstimatedTaxes {
  ivaCobrado: number
  ivaPagado: number
  ivaNeto: number
  isrEstimado: number
  utilidadNeta: number
}

export type PersistedQuotationItem = Omit<import('@/lib/types').ItemCotizacion, 'id'>

export interface QuotationPdfItem {
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
}

export interface QuotationPdfPayload {
  id: string
  cliente: string
  proyecto: string
  fecha_entrega: string | null
  locacion: string | null
  fecha_cotizacion: string | null
  items: QuotationPdfItem[]
  subtotal: number
  fee_agencia: number
  general: number
  iva: number
  total: number
  iva_activo: boolean
  porcentaje_fee: number
  descuento_tipo: DescuentoTipo
  descuento_valor: number
}

export type QuotationLikeForPdf = Pick<
  Cotizacion,
  | 'id'
  | 'cliente'
  | 'proyecto'
  | 'fecha_entrega'
  | 'locacion'
  | 'fecha_cotizacion'
  | 'subtotal'
  | 'fee_agencia'
  | 'general'
  | 'iva'
  | 'total'
  | 'porcentaje_fee'
  | 'iva_activo'
  | 'descuento_tipo'
  | 'descuento_valor'
>

export interface SaveQuotationOptions {
  estado: Extract<QuotationStatus, 'BORRADOR' | 'EMITIDA'>
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: DescuentoTipo
  descuento_valor: number
  id?: string
  tipo?: QuotationKind
  es_complementaria_de?: string
  reservation_token?: string | null
  notas_internas?: string | null
}

export interface UpdateQuotationOptions {
  estado?: QuotationStatus
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: DescuentoTipo
  descuento_valor: number
  responsables: Proveedor[]
  currentQuotation: Cotizacion | null
  notas_internas?: string | null
}
