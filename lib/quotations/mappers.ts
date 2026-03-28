import { Cotizacion, ItemCotizacion } from '@/lib/types'
import { calculateQuotationTotals, normalizeQuotationItem } from './calculations'
import {
  PersistedQuotationItem,
  QuotationFormItem,
  QuotationFormValues,
  QuotationLikeForPdf,
  QuotationPdfPayload,
} from './types'

export const EMPTY_QUOTATION_ITEM: QuotationFormItem = {
  categoria: '',
  descripcion: '',
  cantidad: 1,
  precio_unitario: '',
  responsable_id: '',
  responsable_nombre: '',
  x_pagar: '',
}

export function mapQuotationItemsForSave(items: QuotationFormItem[]) {
  return items.map((item, index) => {
    const normalizedItem = normalizeQuotationItem(item)
    return {
      ...normalizedItem,
      orden: index,
    }
  })
}

interface BuildQuotationMutationPayloadOptions {
  estado?: 'BORRADOR' | 'ENVIADA' | 'APROBADA'
  porcentaje_fee: number
  iva_activo: boolean
  descuento_tipo: 'monto' | 'porcentaje'
  descuento_valor: number
}

export function buildQuotationMutationPayload(
  data: QuotationFormValues,
  options: BuildQuotationMutationPayloadOptions
) {
  return {
    ...data,
    items: mapQuotationItemsForSave(data.items),
    porcentaje_fee: options.porcentaje_fee,
    iva_activo: options.iva_activo,
    descuento_tipo: options.descuento_tipo,
    descuento_valor: options.descuento_valor,
    ...(options.estado ? { estado: options.estado } : {}),
  }
}

export function buildQuotationPdfPayload(
  quotation: QuotationLikeForPdf,
  items: QuotationFormItem[] | ItemCotizacion[]
): QuotationPdfPayload {
  const normalizedItems = items.map(item => normalizeQuotationItem(item as QuotationFormItem))

  return {
    id: quotation.id,
    cliente: quotation.cliente,
    proyecto: quotation.proyecto,
    fecha_entrega: quotation.fecha_entrega,
    locacion: quotation.locacion,
    fecha_cotizacion: quotation.fecha_cotizacion,
    items: normalizedItems.map(item => ({
      categoria: item.categoria,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      importe: item.importe,
    })),
    subtotal: quotation.subtotal,
    fee_agencia: quotation.fee_agencia,
    general: quotation.general,
    iva: quotation.iva,
    total: quotation.total,
    iva_activo: quotation.iva_activo ?? true,
    porcentaje_fee: quotation.porcentaje_fee ?? 0.15,
    descuento_tipo: quotation.descuento_tipo ?? 'monto',
    descuento_valor: quotation.descuento_valor ?? 0,
  }
}

interface BuildPersistedQuotationItemsOptions {
  previousItems?: ItemCotizacion[]
  preservePreviousResponsables?: boolean
  preservePreviousNotas?: boolean
}

export function buildPersistedQuotationItems(
  cotizacionId: string,
  items: Partial<ItemCotizacion>[],
  options: BuildPersistedQuotationItemsOptions = {}
): PersistedQuotationItem[] {
  const previousItems = options.previousItems || []
  const previousItemsById = new Map(previousItems.map(item => [item.id, item]))

  return items.map((item, index) => {
    const previousItem = (item.id && previousItemsById.get(item.id)) || previousItems[index]
    const normalizedItem = normalizeQuotationItem({
      id: item.id,
      categoria: item.categoria || '',
      descripcion: item.descripcion || '',
      cantidad: item.cantidad ?? 0,
      precio_unitario: item.precio_unitario ?? 0,
      responsable_id: item.responsable_id || '',
      responsable_nombre: item.responsable_nombre || '',
      x_pagar: item.x_pagar ?? 0,
    })

    return {
      cotizacion_id: cotizacionId,
      categoria: normalizedItem.categoria,
      descripcion: normalizedItem.descripcion,
      cantidad: normalizedItem.cantidad,
      precio_unitario: normalizedItem.precio_unitario,
      responsable_id: options.preservePreviousResponsables
        ? item.responsable_id || previousItem?.responsable_id || null
        : item.responsable_id || null,
      responsable_nombre: options.preservePreviousResponsables
        ? item.responsable_nombre || previousItem?.responsable_nombre || null
        : item.responsable_nombre || null,
      x_pagar: normalizedItem.x_pagar,
      importe: normalizedItem.importe,
      margen: normalizedItem.margen,
      orden: item.orden ?? index,
      notas: options.preservePreviousNotas
        ? item.notas ?? previousItem?.notas ?? null
        : item.notas ?? null,
    }
  })
}

export function buildQuotationPersistenceData(
  items: Partial<ItemCotizacion>[],
  porcentaje_fee = 0.15,
  iva_activo = true,
  descuento_tipo: 'monto' | 'porcentaje' = 'monto',
  descuento_valor = 0
) {
  const totals = calculateQuotationTotals({
    items: items.map(item => ({
      categoria: item.categoria || '',
      descripcion: item.descripcion || '',
      cantidad: item.cantidad ?? 0,
      precio_unitario: item.precio_unitario ?? 0,
      responsable_id: String(item.responsable_id || ''),
      responsable_nombre: String(item.responsable_nombre || ''),
      x_pagar: item.x_pagar ?? 0,
    })),
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
  })

  return {
    subtotal: totals.subtotal,
    fee_agencia: totals.fee_agencia,
    general: totals.general,
    iva: totals.iva,
    total: totals.total,
    margen_total: totals.margen_total,
    utilidad_total: totals.utilidad_total,
    porcentaje_fee,
    iva_activo,
    descuento_tipo,
    descuento_valor,
  }
}

export function buildReadOnlyTotals(cotizacion: Cotizacion) {
  const general = cotizacion.general ?? 0
  const descuento = (cotizacion.descuento_tipo ?? 'monto') === 'porcentaje'
    ? general * ((cotizacion.descuento_valor ?? 0) / 100)
    : (cotizacion.descuento_valor ?? 0)

  return {
    subtotal: cotizacion.subtotal ?? 0,
    fee_agencia: cotizacion.fee_agencia ?? 0,
    general,
    descuento,
    iva: cotizacion.iva ?? 0,
    total: cotizacion.total ?? 0,
    margen_total: cotizacion.margen_total ?? 0,
    utilidad_total: cotizacion.utilidad_total ?? 0,
  }
}
