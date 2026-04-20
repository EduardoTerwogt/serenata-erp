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
  const safeValor = Math.max(0, descuento_valor)
  if (descuento_tipo === 'porcentaje') {
    // Porcentaje capped a 100% para evitar totales negativos
    return general * (Math.min(safeValor, 100) / 100)
  }
  // Descuento fijo no puede exceder el monto base
  return Math.min(safeValor, general)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateQuotationTotals({
  items,
  porcentaje_fee,
  iva_activo,
  descuento_tipo,
  descuento_valor,
}: QuotationTotalsInput): QuotationTotals {
  const normalizedItems = items.map(normalizeQuotationItem)
  const subtotal = round2(normalizedItems.reduce((sum, item) => sum + item.importe, 0))
  const fee_agencia = round2(subtotal * porcentaje_fee)
  const general = round2(subtotal + fee_agencia)
  const descuento = round2(calculateDiscountAmount(general, descuento_tipo, descuento_valor))
  const base_iva = round2(general - descuento)
  const iva = iva_activo ? round2(base_iva * 0.16) : 0
  const total = round2(base_iva + iva)
  const margen_total = round2(normalizedItems.reduce((sum, item) => sum + item.margen, 0))
  const utilidad_total = round2(margen_total + fee_agencia - descuento)

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
