import { describe, it, expect } from 'vitest'
import {
  buildPersistedQuotationItems,
  buildQuotationPersistenceData,
  buildReadOnlyTotals,
} from '../mappers'
import type { ItemCotizacion, Cotizacion } from '@/lib/types'

// ==================== buildPersistedQuotationItems ====================

describe('buildPersistedQuotationItems', () => {
  const item = (overrides = {}): Partial<ItemCotizacion> => ({
    categoria: 'Cámara',
    descripcion: 'Canon R5',
    cantidad: 2,
    precio_unitario: 1000,
    x_pagar: 800,
    responsable_id: null,
    responsable_nombre: null,
    ...overrides,
  })

  it('mapea items con cotizacion_id y orden correctos', () => {
    const result = buildPersistedQuotationItems('SH001', [item(), item()])
    expect(result).toHaveLength(2)
    expect(result[0].cotizacion_id).toBe('SH001')
    expect(result[0].orden).toBe(0)
    expect(result[1].orden).toBe(1)
  })

  it('calcula importe y margen correctamente', () => {
    const result = buildPersistedQuotationItems('SH001', [item()])
    expect(result[0].importe).toBe(2000) // 2 * 1000
    expect(result[0].margen).toBe(1200)  // 2000 - 800
  })

  it('preserva responsable del item anterior cuando preservePreviousResponsables=true', () => {
    const previousItems: ItemCotizacion[] = [
      {
        id: 'item-1',
        cotizacion_id: 'SH001',
        categoria: 'Cámara',
        descripcion: 'Canon R5',
        cantidad: 2,
        precio_unitario: 1000,
        importe: 2000,
        x_pagar: 800,
        margen: 1200,
        orden: 0,
        responsable_id: 'resp-123',
        responsable_nombre: 'Juan',
        notas: null,
      },
    ]

    const newItem = item({ id: 'item-1', responsable_id: null, responsable_nombre: null })
    const result = buildPersistedQuotationItems('SH001', [newItem], {
      previousItems,
      preservePreviousResponsables: true,
    })

    expect(result[0].responsable_id).toBe('resp-123')
    expect(result[0].responsable_nombre).toBe('Juan')
  })

  it('NO preserva responsable cuando preservePreviousResponsables=false', () => {
    const previousItems: ItemCotizacion[] = [
      {
        id: 'item-1',
        cotizacion_id: 'SH001',
        categoria: 'Cámara',
        descripcion: 'Canon R5',
        cantidad: 2,
        precio_unitario: 1000,
        importe: 2000,
        x_pagar: 800,
        margen: 1200,
        orden: 0,
        responsable_id: 'resp-123',
        responsable_nombre: 'Juan',
        notas: null,
      },
    ]

    const newItem = item({ id: 'item-1', responsable_id: null, responsable_nombre: null })
    const result = buildPersistedQuotationItems('SH001', [newItem], {
      previousItems,
      preservePreviousResponsables: false,
    })

    expect(result[0].responsable_id).toBeNull()
    expect(result[0].responsable_nombre).toBeNull()
  })

  it('lista vacía retorna array vacío', () => {
    expect(buildPersistedQuotationItems('SH001', [])).toHaveLength(0)
  })
})

// ==================== buildQuotationPersistenceData ====================

describe('buildQuotationPersistenceData', () => {
  it('retorna todos los campos de totales', () => {
    const result = buildQuotationPersistenceData(
      [{ descripcion: 'Test', cantidad: 1, precio_unitario: 1000, x_pagar: 500 }],
      0.15,
      true,
      'monto',
      0
    )

    expect(result).toHaveProperty('subtotal')
    expect(result).toHaveProperty('fee_agencia')
    expect(result).toHaveProperty('general')
    expect(result).toHaveProperty('iva')
    expect(result).toHaveProperty('total')
    expect(result).toHaveProperty('margen_total')
    expect(result).toHaveProperty('utilidad_total')
    expect(result).toHaveProperty('porcentaje_fee', 0.15)
    expect(result).toHaveProperty('iva_activo', true)
    expect(result).toHaveProperty('descuento_tipo', 'monto')
    expect(result).toHaveProperty('descuento_valor', 0)
  })

  it('subtotal = suma de importes de items', () => {
    const result = buildQuotationPersistenceData(
      [
        { descripcion: 'A', cantidad: 2, precio_unitario: 500, x_pagar: 0 },
        { descripcion: 'B', cantidad: 1, precio_unitario: 300, x_pagar: 0 },
      ],
      0,
      false,
      'monto',
      0
    )
    expect(result.subtotal).toBe(1300) // 1000 + 300
    expect(result.total).toBe(1300)    // sin fee, sin IVA, sin descuento
  })
})

// ==================== buildReadOnlyTotals ====================

describe('buildReadOnlyTotals', () => {
  const baseCotizacion = (): Cotizacion => ({
    id: 'SH001',
    cliente: 'Cliente',
    proyecto: 'Proyecto',
    fecha_entrega: null,
    locacion: null,
    fecha_cotizacion: null,
    tipo: 'PRINCIPAL',
    es_complementaria_de: null,
    estado: 'BORRADOR',
    subtotal: 1000,
    fee_agencia: 150,
    general: 1150,
    iva: 184,
    total: 1334,
    margen_total: 500,
    utilidad_total: 650,
    descuento_tipo: 'monto',
    descuento_valor: 0,
    created_at: '2026-01-01',
  })

  it('retorna los totales de la cotización con descuento monto=0', () => {
    const result = buildReadOnlyTotals(baseCotizacion())
    expect(result.total).toBe(1334)
    expect(result.descuento).toBe(0)
    expect(result.general).toBe(1150)
  })

  it('calcula descuento por porcentaje desde general', () => {
    const cotizacion = { ...baseCotizacion(), descuento_tipo: 'porcentaje' as const, descuento_valor: 10 }
    const result = buildReadOnlyTotals(cotizacion)
    expect(result.descuento).toBeCloseTo(115) // 1150 * 10%
  })

  it('retorna ceros si todos los campos son null/undefined', () => {
    const empty = {
      ...baseCotizacion(),
      subtotal: undefined as unknown as number,
      fee_agencia: undefined as unknown as number,
      general: undefined as unknown as number,
      iva: undefined as unknown as number,
      total: undefined as unknown as number,
      margen_total: undefined as unknown as number,
      utilidad_total: undefined as unknown as number,
    }
    const result = buildReadOnlyTotals(empty)
    expect(result.subtotal).toBe(0)
    expect(result.total).toBe(0)
  })
})
