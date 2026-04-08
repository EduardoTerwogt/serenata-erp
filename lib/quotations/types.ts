import { Cotizacion, Responsable } from '@/lib/types'

export type DescuentoTipo = 'monto' | 'porcentaje'
export type QuotationStatus = 'BORRADOR' | 'ENVIADA' | 'APROBADA'
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

export interface PersistedQuotationItem extends Omit<import('@/lib/types').ItemCotizacion, 'id'> {}

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
  estado: Extract<QuotationStatus, 'BORRADOR' | 'ENVIADA'>
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: DescuentoTipo
  descuento_valor: number
  id?: string
  tipo?: QuotationKind
  es_complementaria_de?: string
  reservation_token?: string | null
}

export interface UpdateQuotationOptions {
  estado?: QuotationStatus
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: DescuentoTipo
  descuento_valor: number
  responsables: Responsable[]
  currentQuotation: Cotizacion | null
}
