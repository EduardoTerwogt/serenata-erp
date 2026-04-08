import { describe, it, expect } from 'vitest'
import {
  CotizacionCreateSchema,
  CotizacionUpdateSchema,
  ProyectoUpdateSchema,
  ItemPatchSchema,
  validate,
} from '../schemas'

// ==================== validate helper ====================

describe('validate', () => {
  it('retorna ok=true y data cuando el payload es válido', () => {
    const result = validate(CotizacionCreateSchema, {
      cliente: 'Cliente Test',
      proyecto: 'Proyecto Test',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.cliente).toBe('Cliente Test')
    }
  })

  it('retorna ok=false con details cuando el payload es inválido', () => {
    const result = validate(CotizacionCreateSchema, { cliente: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.details.length).toBeGreaterThan(0)
    }
  })
})

// ==================== CotizacionCreateSchema ====================

describe('CotizacionCreateSchema', () => {
  it('acepta payload mínimo válido', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: 'Spot TV',
    })
    expect(result.success).toBe(true)
  })

  it('falla si cliente está vacío', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: '',
      proyecto: 'Spot TV',
    })
    expect(result.success).toBe(false)
  })

  it('falla si proyecto está vacío', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: '',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza estado no válido', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: 'Spot TV',
      estado: 'INVALIDO',
    })
    expect(result.success).toBe(false)
  })

  it('acepta tipo COMPLEMENTARIA', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: 'Spot TV',
      tipo: 'COMPLEMENTARIA',
      es_complementaria_de: 'SH001',
    })
    expect(result.success).toBe(true)
  })

  it('aplica defaults: porcentaje_fee=0.15, iva_activo=true, descuento_tipo=monto', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Test',
      proyecto: 'Test',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.porcentaje_fee).toBe(0.15)
      expect(result.data.iva_activo).toBe(true)
      expect(result.data.descuento_tipo).toBe('monto')
    }
  })

  it('acepta items con descripcion', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Test',
      proyecto: 'Test',
      items: [{ descripcion: 'Camera', cantidad: 1, precio_unitario: 1000, x_pagar: 500 }],
    })
    expect(result.success).toBe(true)
  })

  it('falla si un item tiene descripción vacía', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Test',
      proyecto: 'Test',
      items: [{ descripcion: '', cantidad: 1 }],
    })
    expect(result.success).toBe(false)
  })
})

// ==================== CotizacionUpdateSchema ====================

describe('CotizacionUpdateSchema', () => {
  it('acepta payload vacío (update parcial)', () => {
    const result = CotizacionUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('acepta update parcial solo con estado', () => {
    const result = CotizacionUpdateSchema.safeParse({ estado: 'ENVIADA' })
    expect(result.success).toBe(true)
  })

  it('rechaza estado no válido', () => {
    const result = CotizacionUpdateSchema.safeParse({ estado: 'ELIMINADA' })
    expect(result.success).toBe(false)
  })
})

// ==================== ProyectoUpdateSchema ====================

describe('ProyectoUpdateSchema', () => {
  it('acepta payload vacío', () => {
    const result = ProyectoUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('acepta estados válidos', () => {
    for (const estado of ['PREPRODUCCION', 'RODAJE', 'POSTPRODUCCION', 'FINALIZADO']) {
      const result = ProyectoUpdateSchema.safeParse({ estado })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza estado no válido', () => {
    const result = ProyectoUpdateSchema.safeParse({ estado: 'PAUSADO' })
    expect(result.success).toBe(false)
  })

  it('acepta notas_por_item como objeto string-string', () => {
    const result = ProyectoUpdateSchema.safeParse({
      notas_por_item: { 'item-1': 'Llevar cable HDMI', 'item-2': '' },
    })
    expect(result.success).toBe(true)
  })
})

// ==================== ItemPatchSchema ====================

describe('ItemPatchSchema', () => {
  it('acepta solo responsable_id', () => {
    const result = ItemPatchSchema.safeParse({ responsable_id: 'resp-123' })
    expect(result.success).toBe(true)
  })

  it('acepta solo notas', () => {
    const result = ItemPatchSchema.safeParse({ notas: 'Llevar equipo extra' })
    expect(result.success).toBe(true)
  })

  it('acepta null en responsable_id (desasignar)', () => {
    const result = ItemPatchSchema.safeParse({ responsable_id: null })
    expect(result.success).toBe(true)
  })

  it('acepta null en notas (borrar nota)', () => {
    const result = ItemPatchSchema.safeParse({ notas: null })
    expect(result.success).toBe(true)
  })

  it('falla con objeto vacío (ningún campo enviado)', () => {
    const result = ItemPatchSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
