import { describe, it, expect } from 'vitest'
import {
  CotizacionCreateSchema,
  CotizacionUpdateSchema,
  ProyectoUpdateSchema,
  ItemPatchSchema,
  ProveedorCreateSchema,
  ProveedorUpdateSchema,
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

  it('L1: el estado no viaja en el guardado (se ignora; cambia solo por RPC)', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: 'Spot TV',
      estado: 'APROBADA',
    })
    expect(result.success).toBe(true)
    expect(result.success && 'estado' in result.data).toBe(false)
  })

  it('G5: la fecha de entrega es AAAA-MM-DD o vacía', () => {
    const base = { cliente: 'Coca Cola', proyecto: 'Spot TV' }
    expect(CotizacionCreateSchema.safeParse({ ...base, fecha_entrega: '2026-10-05' }).success).toBe(true)
    expect(CotizacionCreateSchema.safeParse({ ...base, fecha_entrega: '' }).success).toBe(true)
    expect(CotizacionCreateSchema.safeParse({ ...base, fecha_entrega: '05/10/2026' }).success).toBe(false)
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
      items: [{ descripcion: 'Camera', cantidad: 1, precio_unitario: 1000, costo_unitario: 500 }],
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

  it('acepta cliente_id como uuid válido', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: 'Spot TV',
      cliente_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(result.success).toBe(true)
  })

  it('acepta cliente_id null (sin match seguro en el catálogo, Bloque 3)', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: 'Spot TV',
      cliente_id: null,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza cliente_id que no es un uuid válido', () => {
    const result = CotizacionCreateSchema.safeParse({
      cliente: 'Coca Cola',
      proyecto: 'Spot TV',
      cliente_id: 'no-es-un-uuid',
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
    const result = CotizacionUpdateSchema.safeParse({ estado: 'EMITIDA' })
    expect(result.success).toBe(true)
  })

  it('L1: ignora el estado (no se puede cambiar por el PUT)', () => {
    const result = CotizacionUpdateSchema.safeParse({ estado: 'APROBADA' })
    expect(result.success && 'estado' in result.data).toBe(false)
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

// ==================== ProveedorCreateSchema / ProveedorUpdateSchema ====================
// Fase 5.1: regimen_fiscal ('moral' | 'fisica'), captura única por proveedor.

describe('ProveedorCreateSchema', () => {
  it('acepta payload mínimo sin regimen_fiscal', () => {
    const result = ProveedorCreateSchema.safeParse({ nombre: 'Julián López' })
    expect(result.success).toBe(true)
  })

  it('acepta regimen_fiscal moral', () => {
    const result = ProveedorCreateSchema.safeParse({ nombre: 'Distrito Sonoro', regimen_fiscal: 'moral' })
    expect(result.success).toBe(true)
  })

  it('acepta regimen_fiscal fisica', () => {
    const result = ProveedorCreateSchema.safeParse({ nombre: 'Julián López', regimen_fiscal: 'fisica' })
    expect(result.success).toBe(true)
  })

  it('acepta regimen_fiscal null (no capturado aún)', () => {
    const result = ProveedorCreateSchema.safeParse({ nombre: 'Julián López', regimen_fiscal: null })
    expect(result.success).toBe(true)
  })

  it('rechaza un valor de regimen_fiscal inválido', () => {
    const result = ProveedorCreateSchema.safeParse({ nombre: 'Julián López', regimen_fiscal: 'persona_fisica' })
    expect(result.success).toBe(false)
  })
})

describe('ProveedorUpdateSchema', () => {
  it('acepta actualizar solo regimen_fiscal', () => {
    const result = ProveedorUpdateSchema.safeParse({ regimen_fiscal: 'fisica' })
    expect(result.success).toBe(true)
  })

  it('rechaza un valor de regimen_fiscal inválido', () => {
    const result = ProveedorUpdateSchema.safeParse({ regimen_fiscal: 'moral_persona' })
    expect(result.success).toBe(false)
  })
})

// ── #130: selector de proyectos, pago por proyecto, preparar y completar cliente ─────────────────────────────────
import {
  ClienteCompletarSchema,
  DatosFiscalesToleranciaSchema,
  EstadoCuentaQuerySchema,
  FacturaCrearSchema,
  ProyectosSelectorQuerySchema,
  validate as validar130,
} from '../schemas'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const PROVEEDOR_NUEVO = { nombre: 'Audio Lemus', rfc: 'ale211125dc7', regimen_fiscal: 'moral', telefono: '5500000000', correo: 'a@b.co', banco: 'BBVA', clabe: '0123 4567 8901 2345 67' }

describe('EstadoCuentaQuerySchema.proyectos (#130)', () => {
  it('separa por coma, recorta y no pide el filtro', () => {
    const ok = validar130(EstadoCuentaQuerySchema, { lado: 'cobro', id: U1, proyectos: 'SH061, SH062 ,' })
    expect(ok.ok && ok.data.proyectos).toEqual(['SH061', 'SH062'])
    const sin = validar130(EstadoCuentaQuerySchema, { lado: 'cobro', id: U1 })
    expect(sin.ok && sin.data.proyectos).toBeUndefined()
  })
  it('rechaza una lista vacía de ids o de más de 50', () => {
    expect(validar130(EstadoCuentaQuerySchema, { lado: 'cobro', id: U1, proyectos: ' , ' }).ok).toBe(false)
    expect(validar130(EstadoCuentaQuerySchema, { lado: 'cobro', id: U1, proyectos: Array.from({ length: 51 }, (_, i) => `P${i}`).join(',') }).ok).toBe(false)
  })
})

describe('ProyectosSelectorQuerySchema (#130)', () => {
  it('toma valores por omisión y convierte solo_pendientes', () => {
    const r = validar130(ProyectosSelectorQuerySchema, { modo: 'renglones' })
    expect(r.ok && r.data).toMatchObject({ solo_pendientes: true, page: 1, page_size: 25 })
    const f = validar130(ProyectosSelectorQuerySchema, { modo: 'pago', lado: 'cobro', solo_pendientes: 'false' })
    expect(f.ok && f.data.solo_pendientes).toBe(false)
  })
  it('el modo pago exige lado y el tamaño de página tiene tope', () => {
    expect(validar130(ProyectosSelectorQuerySchema, { modo: 'pago' }).ok).toBe(false)
    expect(validar130(ProyectosSelectorQuerySchema, { modo: 'renglones', page_size: '51' }).ok).toBe(false)
  })
})

describe('FacturaCrearSchema.preparar (#130)', () => {
  const base = { operation_id: U1 }
  it('acepta proveedor nuevo con renglones: normaliza RFC y CLABE', () => {
    const r = validar130(FacturaCrearSchema, { ...base, preparar: { proveedor: PROVEEDOR_NUEVO, renglones: [U2] } })
    expect(r.ok && r.data.preparar?.proveedor).toMatchObject({ rfc: 'ALE211125DC7', clabe: '012345678901234567' })
  })
  it('acepta un gasto extra con proveedor existente (sin datos de alta)', () => {
    expect(validar130(FacturaCrearSchema, { ...base, contraparte_id: U2, preparar: { gasto: { proyecto_id: 'SH061', concepto: 'Renta', costo_total: 5000 } } }).ok).toBe(true)
  })
  it('exige renglones o gasto, no ambos ni ninguno', () => {
    const gasto = { proyecto_id: 'SH061', concepto: 'Renta', costo_total: 5000 }
    expect(validar130(FacturaCrearSchema, { ...base, preparar: { proveedor: PROVEEDOR_NUEVO } }).ok).toBe(false)
    expect(validar130(FacturaCrearSchema, { ...base, preparar: { renglones: [U2], gasto } }).ok).toBe(false)
    expect(validar130(FacturaCrearSchema, { ...base, preparar: { renglones: [] } }).ok).toBe(false)
  })
  it('rechaza un alta incompleta o con datos inválidos (CLABE de 17, correo, RFC, régimen, costo 0)', () => {
    const malo = (campo: object) => validar130(FacturaCrearSchema, { ...base, preparar: { proveedor: { ...PROVEEDOR_NUEVO, ...campo }, renglones: [U2] } }).ok
    expect(malo({ clabe: '01234567890123456' })).toBe(false)
    expect(malo({ correo: 'sin-arroba' })).toBe(false)
    expect(malo({ rfc: 'XX' })).toBe(false)
    expect(malo({ regimen_fiscal: 'otro' })).toBe(false)
    expect(malo({ banco: '' })).toBe(false)
    expect(validar130(FacturaCrearSchema, { ...base, contraparte_id: U2, preparar: { gasto: { proyecto_id: 'SH061', concepto: 'x', costo_total: 0 } } }).ok).toBe(false)
  })
  it('sin preparar sigue siendo la factura de siempre', () => {
    expect(validar130(FacturaCrearSchema, { ...base, grupo_id: U2 }).ok).toBe(true)
  })
})

describe('DatosFiscalesToleranciaSchema y ClienteCompletarSchema (#130)', () => {
  it('la tolerancia va de 0 a 100 pesos', () => {
    expect(validar130(DatosFiscalesToleranciaSchema, { tolerancia_total: '1.5' }).ok).toBe(true)
    expect(validar130(DatosFiscalesToleranciaSchema, { tolerancia_total: -1 }).ok).toBe(false)
    expect(validar130(DatosFiscalesToleranciaSchema, { tolerancia_total: 101 }).ok).toBe(false)
    expect(validar130(DatosFiscalesToleranciaSchema, {}).ok).toBe(false)
  })
  it('completar cliente normaliza el RFC y valida el correo', () => {
    const r = validar130(ClienteCompletarSchema, { rfc: ' maz180920hj5 ', correo: 'ana@marea.mx' })
    expect(r.ok && r.data.rfc).toBe('MAZ180920HJ5')
    expect(validar130(ClienteCompletarSchema, { correo: 'nope' }).ok).toBe(false)
    expect(validar130(ClienteCompletarSchema, { rfc: 'abc' }).ok).toBe(false)
  })
})
