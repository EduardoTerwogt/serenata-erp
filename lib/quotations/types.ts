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
  // Bloque 3 (docs/PLAN.md): `x_pagar` es el Costo Unitario (neto al
  // responsable); `costo_total = x_pagar * cantidad` es la fuente de verdad
  // centralizada para cualquier fórmula derivada (IVA pagado, Costo + IVA
  // en Partidas, margen) -- nunca recalcular `x_pagar * cantidad` suelto en
  // otro lugar.
  costo_total: number
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

// Fase 5.1: panel "Impuestos (estimado)". IVA pagado es siempre 16% del Costo Total
// (x_pagar * cantidad, Bloque 3) de cada partida, sin importar el regimen fiscal del
// responsable -- la retencion no reduce lo acreditable para Serenata, solo cambia el
// neto que recibe el proveedor (documento maestro seccion 3; decision confirmada 2026-09-06).
export interface EstimatedTaxes {
  ivaCobrado: number
  ivaPagado: number
  ivaNeto: number
  isrEstimado: number
  utilidadNeta: number
}

// El id viaja SOLO cuando la partida ya es de esta cotización, para que el guardado
// completo conserve su identidad en vez de borrarla y recrearla con un id nuevo (ver
// buildPersistedQuotationItems). Antes el tipo lo omitía siempre, que era justo el
// defecto: cada guardado le cambiaba la identidad a todas las partidas.
export type PersistedQuotationItem = Omit<import('@/lib/types').ItemCotizacion, 'id'> & { id?: string }

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
  notas: string | null
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
  | 'notas_pdf'
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
