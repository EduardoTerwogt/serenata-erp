import { describe, expect, it } from 'vitest'
import { mergeImportedIntoBlanks } from '../QuotationItemsSection'
import { EMPTY_QUOTATION_ITEM } from '@/lib/quotations/mappers'

const blanca = (id?: string) => ({ ...EMPTY_QUOTATION_ITEM, ...(id ? { id } : {}) })
const llena = (descripcion: string) => ({ ...EMPTY_QUOTATION_ITEM, descripcion, precio_unitario: 100 })
const importado = (descripcion: string) => ({ descripcion, categoria: 'Cat', cantidad: 2, precio_unitario: 500, x_pagar: 200 })

describe('mergeImportedIntoBlanks', () => {
  it('sin filas en blanco, agrega todo al final', () => {
    const out = mergeImportedIntoBlanks([llena('Ya estaba')], [importado('Uno'), importado('Dos')])
    expect(out.map((i) => i.descripcion)).toEqual(['Ya estaba', 'Uno', 'Dos'])
  })

  it('reutiliza la única fila en blanco', () => {
    const out = mergeImportedIntoBlanks([blanca()], [importado('Uno'), importado('Dos')])
    expect(out.map((i) => i.descripcion)).toEqual(['Uno', 'Dos'])
  })

  it('reutiliza VARIAS filas en blanco, no solo una', () => {
    const out = mergeImportedIntoBlanks([blanca(), blanca(), blanca()], [importado('Uno'), importado('Dos'), importado('Tres')])
    expect(out).toHaveLength(3)
    expect(out.map((i) => i.descripcion)).toEqual(['Uno', 'Dos', 'Tres'])
  })

  it('descarta las filas en blanco que sobran', () => {
    const out = mergeImportedIntoBlanks([blanca(), blanca(), blanca()], [importado('Uno')])
    expect(out.map((i) => i.descripcion)).toEqual(['Uno'])
  })

  it('conserva las filas con datos y respeta su posición', () => {
    const out = mergeImportedIntoBlanks([llena('Primera'), blanca(), llena('Última')], [importado('Metida')])
    expect(out.map((i) => i.descripcion)).toEqual(['Primera', 'Metida', 'Última'])
  })

  it('reutiliza el id de la fila en blanco (para no crear una fila de más)', () => {
    const out = mergeImportedIntoBlanks([blanca('row-1')], [importado('Uno')])
    expect(out[0].id).toBe('row-1')
  })

  it('copia todos los campos del ítem importado', () => {
    const out = mergeImportedIntoBlanks([blanca()], [importado('Uno')])
    expect(out[0]).toMatchObject({ categoria: 'Cat', cantidad: 2, precio_unitario: 500, x_pagar: 200 })
  })
})
