import { describe, expect, it } from 'vitest'
import { CotizacionCreateSchema, CotizacionUpdateSchema, ItemPatchSchema } from '../schemas'

describe('schema normalization', () => {
  it('normaliza responsable_id y responsable_nombre null a string vacío en create', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Cliente Test',
      proyecto: 'Proyecto Test',
      items: [
        {
          descripcion: 'Concepto',
          cantidad: 1,
          precio_unitario: 1000,
          x_pagar: 500,
          responsable_id: null,
          responsable_nombre: null,
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items[0].responsable_id).toBe('')
      expect(result.data.items[0].responsable_nombre).toBe('')
    }
  })

  it('preserva strings válidos de responsables en update', () => {
    const result = CotizacionUpdateSchema.safeParse({
      items: [
        {
          descripcion: 'Concepto',
          cantidad: 1,
          precio_unitario: 1000,
          x_pagar: 500,
          responsable_id: 'resp-1',
          responsable_nombre: 'Juan',
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items?.[0].responsable_id).toBe('resp-1')
      expect(result.data.items?.[0].responsable_nombre).toBe('Juan')
    }
  })

  it('item patch mantiene null cuando se usa para desasignar/borrar', () => {
    const result = ItemPatchSchema.safeParse({
      responsable_id: null,
      responsable_nombre: null,
      notas: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.responsable_id).toBeNull()
      expect(result.data.responsable_nombre).toBeNull()
      expect(result.data.notas).toBeNull()
    }
  })
})
