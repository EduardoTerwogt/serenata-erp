import { DescuentoTipo, QuotationComputedItem, QuotationFormItem, QuotationTotals, QuotationTotalsInput } from './types'

export function toNumberOrZero(value: number | '' | null | undefined): number {
  return typeof value === 'number' ? value : 0
}

export function normalizeQuotationItem(item: QuotationFormItem): QuotationComputedItem {
  const precio_unitario = toNumberOrZero(item.precio_unitario)
  const x_pagar = toNumberOrZero(item.x_pagar)
  const cantidad = item.cantidad || 0
  const importe = cantidad * precio_unitario
  const margen = importe - x_pagar

  return {
    ...item,
    cantidad,
    precio_unitario,
    x_pagar,
    importe,
    margen,
  }
}

export function calculateQuotationItem(item: QuotationFormItem) {
  const normalizedItem = normalizeQuotationItem(item)
  return {
    importe: normalizedItem.importe,
    margen: normalizedItem.margen,
  }
}

export function calculateDiscountAmount(
  general: number,
  descuento_tipo: DescuentoTipo,
  descuento_valor: number
): number {
  return descuento_tipo === 'porcentaje'
    ? general * (descuento_valor / 100)
    : descuento_valor
}

export function calculateQuotationTotals({
  items,
  porcentaje_fee,
  iva_activo,
  descuento_tipo,
  descuento_valor,
}: QuotationTotalsInput): QuotationTotals {
  const normalizedItems = items.map(normalizeQuotationItem)
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.importe, 0)
  const fee_agencia = subtotal * porcentaje_fee
  const general = subtotal + fee_agencia
  const descuento = calculateDiscountAmount(general, descuento_tipo, descuento_valor)
  const base_iva = general - descuento
  const iva = iva_activo ? base_iva * 0.16 : 0
  const total = base_iva + iva
  const margen_total = normalizedItems.reduce((sum, item) => sum + item.margen, 0)
  const utilidad_total = margen_total + fee_agencia - descuento

  return {
    subtotal,
    fee_agencia,
    general,
    descuento,
    iva,
    total,
    margen_total,
    utilidad_total,
  }
}
