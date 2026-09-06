import { describe, it, expect } from 'vitest'
import {
  toNumberOrZero,
  normalizeQuotationItem,
  calculateDiscountAmount,
  calculateQuotationTotals,
  calculateCostoConIva,
  calculateEstimatedTaxes,
} from '../calculations'
import type { QuotationFormItem } from '../types'

const baseItem = (): QuotationFormItem => ({
  categoria: 'Cámara',
  descripcion: 'Canon R5',
  cantidad: 2,
  precio_unitario: 1000,
  responsable_id: '',
  responsable_nombre: '',
  x_pagar: 800,
})

// ==================== toNumberOrZero ====================

describe('toNumberOrZero', () => {
  it('retorna el número si es número', () => {
    expect(toNumberOrZero(42)).toBe(42)
    expect(toNumberOrZero(0)).toBe(0)
    expect(toNumberOrZero(-5)).toBe(-5)
  })

  it('retorna 0 para string vacío', () => {
    expect(toNumberOrZero('')).toBe(0)
  })

  it('retorna 0 para null/undefined', () => {
    expect(toNumberOrZero(null)).toBe(0)
    expect(toNumberOrZero(undefined)).toBe(0)
  })
})

// ==================== normalizeQuotationItem ====================

describe('normalizeQuotationItem', () => {
  it('calcula importe = cantidad * precio_unitario', () => {
    const result = normalizeQuotationItem(baseItem())
    expect(result.importe).toBe(2000) // 2 * 1000
  })

  it('calcula margen = importe - x_pagar', () => {
    const result = normalizeQuotationItem(baseItem())
    expect(result.margen).toBe(1200) // 2000 - 800
  })

  it('normaliza string vacío en precio_unitario a 0', () => {
    const item = { ...baseItem(), precio_unitario: '' as const }
    const result = normalizeQuotationItem(item)
    expect(result.precio_unitario).toBe(0)
    expect(result.importe).toBe(0)
  })

  it('normaliza string vacío en x_pagar a 0', () => {
    const item = { ...baseItem(), x_pagar: '' as const }
    const result = normalizeQuotationItem(item)
    expect(result.x_pagar).toBe(0)
    expect(result.margen).toBe(result.importe)
  })

  it('margen puede ser negativo si x_pagar > importe', () => {
    const item = { ...baseItem(), precio_unitario: 100, x_pagar: 500 }
    const result = normalizeQuotationItem(item)
    expect(result.margen).toBe(-300) // 200 - 500
  })

  it('item con cantidad 0 produce importe 0', () => {
    const item = { ...baseItem(), cantidad: 0 }
    const result = normalizeQuotationItem(item)
    expect(result.importe).toBe(0)
    expect(result.margen).toBe(-800)
  })
})

// ==================== calculateDiscountAmount ====================

describe('calculateDiscountAmount', () => {
  it('descuento por monto retorna el valor exacto', () => {
    expect(calculateDiscountAmount(10000, 'monto', 500)).toBe(500)
  })

  it('descuento por porcentaje calcula correctamente', () => {
    expect(calculateDiscountAmount(10000, 'porcentaje', 10)).toBe(1000)
  })

  it('porcentaje 0 produce descuento 0', () => {
    expect(calculateDiscountAmount(10000, 'porcentaje', 0)).toBe(0)
  })

  it('monto 0 produce descuento 0', () => {
    expect(calculateDiscountAmount(10000, 'monto', 0)).toBe(0)
  })
})

// ==================== calculateQuotationTotals ====================

describe('calculateQuotationTotals', () => {
  const singleItem = [baseItem()] // precio_unitario=1000, cantidad=2 → importe=2000

  it('calcula subtotal como suma de importes', () => {
    const result = calculateQuotationTotals({
      items: singleItem,
      porcentaje_fee: 0,
      iva_activo: false,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    expect(result.subtotal).toBe(2000)
  })

  it('calcula fee_agencia como subtotal * porcentaje_fee', () => {
    const result = calculateQuotationTotals({
      items: singleItem,
      porcentaje_fee: 0.15,
      iva_activo: false,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    expect(result.fee_agencia).toBe(300) // 2000 * 0.15
    expect(result.general).toBe(2300)    // 2000 + 300
  })

  it('aplica IVA del 16% sobre base_iva cuando iva_activo=true', () => {
    const result = calculateQuotationTotals({
      items: singleItem,
      porcentaje_fee: 0,
      iva_activo: true,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    expect(result.iva).toBeCloseTo(320) // 2000 * 0.16
    expect(result.total).toBeCloseTo(2320)
  })

  it('no aplica IVA cuando iva_activo=false', () => {
    const result = calculateQuotationTotals({
      items: singleItem,
      porcentaje_fee: 0,
      iva_activo: false,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    expect(result.iva).toBe(0)
    expect(result.total).toBe(2000)
  })

  it('aplica descuento por monto antes del IVA', () => {
    const result = calculateQuotationTotals({
      items: singleItem,
      porcentaje_fee: 0,
      iva_activo: true,
      descuento_tipo: 'monto',
      descuento_valor: 200,
    })
    // general=2000, descuento=200, base_iva=1800, iva=288, total=2088
    expect(result.descuento).toBe(200)
    expect(result.iva).toBeCloseTo(288)
    expect(result.total).toBeCloseTo(2088)
  })

  it('aplica descuento por porcentaje antes del IVA', () => {
    const result = calculateQuotationTotals({
      items: singleItem,
      porcentaje_fee: 0,
      iva_activo: false,
      descuento_tipo: 'porcentaje',
      descuento_valor: 10,
    })
    // general=2000, descuento=200, total=1800
    expect(result.descuento).toBe(200)
    expect(result.total).toBe(1800)
  })

  it('calcula margen_total como suma de márgenes de items', () => {
    const result = calculateQuotationTotals({
      items: singleItem, // x_pagar=800, importe=2000 → margen=1200
      porcentaje_fee: 0,
      iva_activo: false,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    expect(result.margen_total).toBe(1200)
  })

  it('resultado con items vacíos es todo ceros', () => {
    const result = calculateQuotationTotals({
      items: [],
      porcentaje_fee: 0.15,
      iva_activo: true,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    expect(result.subtotal).toBe(0)
    expect(result.total).toBe(0)
    expect(result.iva).toBe(0)
  })
})

// ==================== calculateCostoConIva ====================

describe('calculateCostoConIva', () => {
  it('calcula 16% fijo sobre x_pagar', () => {
    expect(calculateCostoConIva(1000)).toBe(1160)
  })

  it('retorna 0 para x_pagar vacío o nulo', () => {
    expect(calculateCostoConIva('')).toBe(0)
    expect(calculateCostoConIva(null)).toBe(0)
    expect(calculateCostoConIva(undefined)).toBe(0)
  })
})

// ==================== calculateEstimatedTaxes ====================
// Fase 5.1: IVA pagado es siempre 16% del X Pagar sin importar el régimen del
// responsable -- la retención no reduce lo acreditable para Serenata (decisión
// confirmada 2026-09-06). Esta sección no necesita el régimen fiscal para nada.

describe('calculateEstimatedTaxes', () => {
  const items: QuotationFormItem[] = [baseItem()] // x_pagar=800

  it('IVA pagado es 16% del x_pagar total, sin importar régimen', () => {
    const totals = calculateQuotationTotals({
      items,
      porcentaje_fee: 0,
      iva_activo: true,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    const result = calculateEstimatedTaxes(items, totals)
    expect(result.ivaPagado).toBeCloseTo(128) // 800 * 0.16
  })

  it('IVA cobrado viene de totals.iva y el neto es la diferencia', () => {
    const totals = calculateQuotationTotals({
      items,
      porcentaje_fee: 0,
      iva_activo: true,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    const result = calculateEstimatedTaxes(items, totals)
    expect(result.ivaCobrado).toBeCloseTo(320) // 2000 * 0.16
    expect(result.ivaNeto).toBeCloseTo(192) // 320 - 128
  })

  it('ISR estimado es 30% de la utilidad y se resta de utilidad neta', () => {
    const totals = calculateQuotationTotals({
      items,
      porcentaje_fee: 0,
      iva_activo: false,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    // utilidad_total = margen_total (1200) + fee_agencia (0) - descuento (0)
    const result = calculateEstimatedTaxes(items, totals)
    expect(result.isrEstimado).toBeCloseTo(360) // 1200 * 0.30
    expect(result.utilidadNeta).toBeCloseTo(840) // 1200 - 360
  })

  it('no genera ISR negativo cuando la utilidad es una pérdida', () => {
    const lossItems: QuotationFormItem[] = [{ ...baseItem(), precio_unitario: 100, x_pagar: 500 }]
    const totals = calculateQuotationTotals({
      items: lossItems,
      porcentaje_fee: 0,
      iva_activo: false,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    expect(totals.utilidad_total).toBeLessThan(0)
    const result = calculateEstimatedTaxes(lossItems, totals)
    expect(result.isrEstimado).toBe(0)
    expect(result.utilidadNeta).toBe(totals.utilidad_total)
  })

  it('con items vacíos todo es cero', () => {
    const totals = calculateQuotationTotals({
      items: [],
      porcentaje_fee: 0,
      iva_activo: true,
      descuento_tipo: 'monto',
      descuento_valor: 0,
    })
    const result = calculateEstimatedTaxes([], totals)
    expect(result.ivaCobrado).toBe(0)
    expect(result.ivaPagado).toBe(0)
    expect(result.ivaNeto).toBe(0)
    expect(result.isrEstimado).toBe(0)
    expect(result.utilidadNeta).toBe(0)
  })
})
