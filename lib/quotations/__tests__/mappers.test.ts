import { describe, it, expect } from 'vitest'
import {
  buildPersistedQuotationItems,
  buildQuotationPersistenceData,
  buildReadOnlyTotals,
  isBlankQuotationItem,
  canAutosaveQuotationDraft,
  draftItemsForSave,
  reconcileServerItems,
  EMPTY_QUOTATION_ITEM,
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

  it('calcula importe y margen correctamente (Bloque 3: margen sobre Costo Total, no Costo Unitario suelto)', () => {
    const result = buildPersistedQuotationItems('SH001', [item()])
    expect(result[0].importe).toBe(2000) // 2 * 1000
    expect(result[0].margen).toBe(400)   // 2000 - (800 * 2)
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


// ==================== isBlankQuotationItem ====================

describe('isBlankQuotationItem', () => {
  it('considera en blanco la fila vacía que crea el formulario', () => {
    expect(isBlankQuotationItem(EMPTY_QUOTATION_ITEM)).toBe(true)
  })

  it('considera en blanco una fila recién creada por el servidor (ceros, no vacíos)', () => {
    expect(isBlankQuotationItem({
      id: 'row-1',
      categoria: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      responsable_id: '',
      responsable_nombre: '',
      x_pagar: 0,
    })).toBe(true)
  })

  it('no considera en blanco una fila con descripción', () => {
    expect(isBlankQuotationItem({ ...EMPTY_QUOTATION_ITEM, descripcion: 'Backline' })).toBe(false)
  })

  it('no considera en blanco una fila con solo categoría', () => {
    expect(isBlankQuotationItem({ ...EMPTY_QUOTATION_ITEM, categoria: 'Producción' })).toBe(false)
  })

  it('no considera en blanco una fila con solo precio', () => {
    expect(isBlankQuotationItem({ ...EMPTY_QUOTATION_ITEM, precio_unitario: 1500 })).toBe(false)
  })

  it('no considera en blanco una fila con solo x_pagar o responsable', () => {
    expect(isBlankQuotationItem({ ...EMPTY_QUOTATION_ITEM, x_pagar: 800 })).toBe(false)
    expect(isBlankQuotationItem({ ...EMPTY_QUOTATION_ITEM, responsable_nombre: 'Ana' })).toBe(false)
  })

  it('ignora espacios en blanco y maneja null/undefined', () => {
    expect(isBlankQuotationItem({ ...EMPTY_QUOTATION_ITEM, descripcion: '   ' })).toBe(true)
    expect(isBlankQuotationItem(null)).toBe(false)
    expect(isBlankQuotationItem(undefined)).toBe(false)
  })
})


// ==================== canAutosaveQuotationDraft ====================

describe('canAutosaveQuotationDraft', () => {
  const valores = (over: { cliente?: string; proyecto?: string; descripciones?: string[] } = {}) => ({
    cliente: over.cliente ?? 'Walmart',
    proyecto: over.proyecto ?? 'Show Monterrey',
    items: (over.descripciones ?? ['Backline']).map((descripcion) => ({ ...EMPTY_QUOTATION_ITEM, descripcion })),
  })

  it('guarda cuando hay cliente, proyecto y una partida con descripción', () => {
    expect(canAutosaveQuotationDraft(valores())).toBe(true)
  })

  it('no guarda sin nombre de proyecto', () => {
    expect(canAutosaveQuotationDraft(valores({ proyecto: '' }))).toBe(false)
    expect(canAutosaveQuotationDraft(valores({ proyecto: '   ' }))).toBe(false)
  })

  // El servidor exige cliente (CotizacionCreateSchema): sin él respondía 400 y el
  // borrador no se guardaba nunca, en silencio.
  it('no guarda sin cliente, porque el servidor lo rechazaría', () => {
    expect(canAutosaveQuotationDraft(valores({ cliente: '' }))).toBe(false)
    expect(canAutosaveQuotationDraft(valores({ cliente: '  ' }))).toBe(false)
  })

  it('no guarda sin ninguna partida con descripción', () => {
    expect(canAutosaveQuotationDraft(valores({ descripciones: [] }))).toBe(false)
    expect(canAutosaveQuotationDraft(valores({ descripciones: ['', '  '] }))).toBe(false)
  })

  it('basta con que una de varias partidas tenga descripción', () => {
    expect(canAutosaveQuotationDraft(valores({ descripciones: ['', 'Backline', ''] }))).toBe(true)
  })
})

// ==================== draftItemsForSave ====================

describe('draftItemsForSave', () => {
  const item = (descripcion: string) => ({ ...EMPTY_QUOTATION_ITEM, descripcion })

  // Cada partida necesita descripción en el schema del servidor: mandar una fila en
  // blanco hacía que se rechazara el guardado ENTERO con un 400.
  it('descarta las filas sin descripción', () => {
    expect(draftItemsForSave([item('Backline'), item(''), item('Grip')]).map((i) => i.descripcion))
      .toEqual(['Backline', 'Grip'])
  })

  it('descarta las que solo tienen espacios', () => {
    expect(draftItemsForSave([item('   ')])).toEqual([])
  })

  it('deja intactas las partidas válidas', () => {
    const items = [item('Backline')]
    expect(draftItemsForSave(items)).toEqual(items)
  })
})

// ==================== reconcileServerItems ====================

describe('reconcileServerItems', () => {
  const fila = (id: string, over: Partial<typeof EMPTY_QUOTATION_ITEM> = {}) => ({
    ...EMPTY_QUOTATION_ITEM, id, descripcion: `desc-${id}`, precio_unitario: 100, x_pagar: 40, ...over,
  })

  it('toma los valores del servidor cuando no hay nada en edición', () => {
    const local = [fila('a'), fila('b')]
    const servidor = [fila('a', { precio_unitario: 999 }), fila('b')]
    const out = reconcileServerItems(local, servidor)
    expect(out.map((i) => i.precio_unitario)).toEqual([999, 100])
  })

  it('NUNCA pisa una celda que el usuario tiene ocupada', () => {
    const local = [fila('a', { descripcion: 'lo que estoy escribiendo', precio_unitario: 9000 })]
    const servidor = [fila('a', { descripcion: 'valor viejo del servidor', precio_unitario: 0 })]
    const out = reconcileServerItems(local, servidor, {
      celdaOcupada: (rowId, campo) => rowId === 'a' && (campo === 'descripcion' || campo === 'precio_unitario'),
    })
    expect(out[0].descripcion).toBe('lo que estoy escribiendo')
    expect(out[0].precio_unitario).toBe(9000)
    // Lo que no está ocupado sí se actualiza.
    expect(out[0].x_pagar).toBe(40)
  })

  it('inserta filas nuevas del servidor', () => {
    const out = reconcileServerItems([fila('a')], [fila('a'), fila('nueva')])
    expect(out.map((i) => i.id)).toEqual(['a', 'nueva'])
  })

  it('descarta filas locales que el servidor ya no tiene', () => {
    const out = reconcileServerItems([fila('a'), fila('borrada')], [fila('a')])
    expect(out.map((i) => i.id)).toEqual(['a'])
  })

  it('conserva las filas locales marcadas (provisionales o en edición)', () => {
    const out = reconcileServerItems([fila('a'), fila('temp:x')], [fila('a')], {
      conservarLocal: (rowId) => rowId.startsWith('temp:'),
    })
    expect(out.map((i) => i.id)).toEqual(['a', 'temp:x'])
  })

  it('respeta el orden del servidor', () => {
    const out = reconcileServerItems([fila('a'), fila('b')], [fila('b'), fila('a')])
    expect(out.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

/**
 * Causa raíz de "se borran los montos" y "no puedo borrar las filas": el guardado
 * completo mandaba las partidas sin id, así que la base las borraba y las reinsertaba
 * con ids nuevos. La otra pantalla quedaba apuntando a partidas inexistentes.
 */
describe('buildPersistedQuotationItems: identidad de las partidas', () => {
  it('conserva el id de una partida que ya es de esta cotización', () => {
    const [fila] = buildPersistedQuotationItems('SH001', [{ id: 'item-1', descripcion: 'Uno editado', cantidad: 1, precio_unitario: 100 }], {
      previousItems: [{ id: 'item-1', descripcion: 'Uno' }] as never,
    })
    expect(fila.id).toBe('item-1')
  })

  it('NO conserva el id de una partida ajena (copiada de otra cotización)', () => {
    const [fila] = buildPersistedQuotationItems('SH001', [{ id: 'item-de-otra', descripcion: 'Copiada', cantidad: 1, precio_unitario: 100 }], {
      previousItems: [{ id: 'item-1', descripcion: 'Uno' }] as never,
    })
    expect(fila.id).toBeUndefined()
  })

  it('una partida nueva viaja sin id', () => {
    const [fila] = buildPersistedQuotationItems('SH001', [{ descripcion: 'Nueva', cantidad: 1, precio_unitario: 100 }])
    expect(fila.id).toBeUndefined()
  })
})
