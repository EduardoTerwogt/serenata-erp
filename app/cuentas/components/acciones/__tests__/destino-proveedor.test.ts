import { describe, expect, it } from 'vitest'
import type { EmisorPreview } from '@/lib/shared/cuentas/factura-preview-tipos'
import type { RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { ALTA_VACIA, armarProveedor, destinoInicial, erroresAlta, grupoExacto, marcaInicial, modoEfectivo, montoDeTexto, proveedorNuevo, type AltaForm, type DestinoProveedor } from '../destino-proveedor'

const emisor: EmisorPreview = { rfc: 'AAA010101AAA', nombre: 'Audio SA de CV', regimen_codigo: '601', regimen_sugerido: 'moral' }
const alta: AltaForm = { telefono: '5512345678', correo: 'pagos@audio.mx', banco: 'BBVA', clabe: '0123 4567 8901 2345 67' }
const SH001 = { proyecto_id: 'SH001', proyecto: 'Boda Lopez' }
const destino = (d: Partial<DestinoProveedor> = {}): DestinoProveedor => ({ ...destinoInicial(), proyecto: SH001, ...d })

describe('erroresAlta / proveedorNuevo', () => {
  it('vacío no marca error pero tampoco arma el proveedor', () => {
    expect(erroresAlta(ALTA_VACIA)).toEqual({})
    expect(proveedorNuevo(emisor, ALTA_VACIA)).toBeNull()
  })
  it('marca correo y CLABE mal escritos', () => {
    expect(erroresAlta({ ...alta, correo: 'sin-arroba', clabe: '123' })).toEqual({ correo: 'Correo inválido', clabe: 'La CLABE debe tener 18 dígitos' })
    expect(proveedorNuevo(emisor, { ...alta, clabe: '123' })).toBeNull()
  })
  it('arma el proveedor con los datos del XML y la CLABE sin espacios', () => {
    expect(proveedorNuevo(emisor, alta)).toEqual({
      nombre: 'Audio SA de CV',
      rfc: 'AAA010101AAA',
      regimen_fiscal: 'moral',
      telefono: '5512345678',
      correo: 'pagos@audio.mx',
      banco: 'BBVA',
      clabe: '012345678901234567',
    })
  })
  it('sin régimen sugerido en el XML no se puede dar de alta', () => {
    expect(proveedorNuevo({ ...emisor, regimen_sugerido: null }, alta)).toBeNull()
    expect(proveedorNuevo(null, alta)).toBeNull()
  })
})

describe('montoDeTexto', () => {
  it('acepta separadores y centavos', () => {
    expect(montoDeTexto('5,800.00')).toBe(5800)
    expect(montoDeTexto('$ 1 250.5')).toBe(1250.5)
  })
  it('rechaza vacío, cero, negativos y más de dos decimales', () => {
    for (const t of ['', '0', '0.00', '-5', '10.123', 'abc']) expect(montoDeTexto(t)).toBeNull()
  })
})

describe('armarProveedor', () => {
  it('grupo existente: manda grupo_id y el proveedor, sin preparar', () => {
    const r = armarProveedor(destino({ grupoId: 'g1' }), { contraparteId: 'p1', emisor })
    expect(r).toEqual({ ok: true, cuerpo: { contraparte_id: 'p1', grupo_id: 'g1' } })
  })
  it('grupo sin elegir o sin proveedor dice qué falta', () => {
    expect(armarProveedor(destino({ proyecto: null }), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false, falta: expect.stringContaining('proyecto') })
    expect(armarProveedor(destino({ grupoId: 'g1' }), { contraparteId: null, emisor })).toMatchObject({ ok: false, falta: 'Elige al proveedor' })
  })
  it('proveedor nuevo con renglones: manda el alta junto a los renglones y contraparte_id nulo', () => {
    const r = armarProveedor(destino({ modo: 'renglones', nuevo: true, alta, renglones: ['c1', 'c2'] }), { contraparteId: null, emisor })
    expect(r).toMatchObject({ ok: true, cuerpo: { contraparte_id: null, preparar: { renglones: ['c1', 'c2'], proveedor: { rfc: 'AAA010101AAA', clabe: '012345678901234567' } } } })
  })
  it('proveedor nuevo incompleto no se envía', () => {
    expect(armarProveedor(destino({ modo: 'renglones', nuevo: true, renglones: ['c1'] }), { contraparteId: null, emisor })).toEqual({ ok: false, falta: 'Completa los datos del proveedor' })
  })
  it('proveedor existente con renglones: sin alta', () => {
    const r = armarProveedor(destino({ modo: 'renglones', renglones: ['c1'] }), { contraparteId: 'p1', emisor })
    expect(r).toEqual({ ok: true, cuerpo: { contraparte_id: 'p1', preparar: { proveedor: undefined, renglones: ['c1'] } } })
  })
  it('renglones sin marcar', () => {
    expect(armarProveedor(destino({ modo: 'renglones' }), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false })
  })
  it('gasto extra: pide concepto y costo, y manda el costo numérico con el proyecto elegido', () => {
    const gasto = { concepto: ' Renta de grúa ', costo: '5,800.00' }
    expect(armarProveedor(destino({ modo: 'gasto', gasto: { ...gasto, concepto: ' ' } }), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false, falta: 'Escribe el concepto del gasto' })
    expect(armarProveedor(destino({ modo: 'gasto', gasto: { ...gasto, costo: '' } }), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false, falta: 'Escribe el costo neto del gasto' })
    expect(armarProveedor(destino({ modo: 'gasto', gasto }), { contraparteId: 'p1', emisor })).toEqual({
      ok: true,
      cuerpo: { contraparte_id: 'p1', preparar: { proveedor: undefined, gasto: { proyecto_id: 'SH001', concepto: 'Renta de grúa', costo_total: 5800 } } },
    })
  })
  it('un gasto extra con grupo deducido sigue siendo gasto: el grupo solo aplica a conceptos', () => {
    expect(modoEfectivo(destino({ modo: 'gasto', grupoId: 'g1' }))).toBe('gasto')
  })
})

const renglon = (id: string, extra: Partial<RenglonSelector> = {}): RenglonSelector => ({
  cuenta_id: id,
  descripcion: id,
  costo_total: 100,
  gasto_extra: false,
  responsable_id: null,
  responsable: null,
  grupo_id: null,
  grupo_estado: null,
  bloqueado: false,
  ...extra,
})
const suyo = (id: string, extra: Partial<RenglonSelector> = {}) => renglon(id, { responsable_id: 'p1', responsable: 'Audio SA', grupo_id: 'g1', grupo_estado: 'ABIERTO', ...extra })

describe('modoEfectivo / grupoExacto', () => {
  const rs = [suyo('a'), suyo('b'), renglon('libre'), renglon('otro', { responsable_id: 'p2', grupo_id: 'g2', grupo_estado: 'ABIERTO' })]

  it('marcar exactamente los conceptos del grupo abierto del proveedor se liga al grupo', () => {
    expect(grupoExacto(rs, ['a', 'b'], 'p1')).toBe('g1')
    expect(modoEfectivo(destino({ modo: 'renglones', grupoId: 'g1' }))).toBe('grupo')
  })
  it('de menos, de más o de otro proveedor: no es el grupo y se asignan conceptos', () => {
    expect(grupoExacto(rs, ['a'], 'p1')).toBeNull()
    expect(grupoExacto(rs, ['a', 'b', 'libre'], 'p1')).toBeNull()
    expect(grupoExacto(rs, ['otro'], 'p1')).toBeNull()
    expect(grupoExacto(rs, [], 'p1')).toBeNull()
  })
  it('un grupo ya facturado o con pagos no se liga como grupo', () => {
    expect(grupoExacto([suyo('a', { grupo_estado: 'FACTURADO' })], ['a'], 'p1')).toBeNull()
    expect(grupoExacto([suyo('a', { bloqueado: true })], ['a'], 'p1')).toBeNull()
  })
  it('un proveedor nuevo nunca usa grupo', () => {
    expect(modoEfectivo(destino({ modo: 'renglones', grupoId: 'g1', nuevo: true }))).toBe('renglones')
  })
})

describe('marcaInicial', () => {
  const rs = [suyo('a'), suyo('b', { bloqueado: true }), renglon('libre1'), renglon('libre2')]
  it('sin propuesta, marca lo que ya es del proveedor y se puede mover', () => {
    expect(marcaInicial(rs, 'p1', null)).toEqual(['a'])
    expect(marcaInicial(rs, null, null)).toEqual([])
  })
  it('la propuesta del neto del XML gana si todos sus conceptos están en el proyecto', () => {
    expect(marcaInicial(rs, 'p1', ['libre1', 'libre2'])).toEqual(['libre1', 'libre2'])
    expect(marcaInicial(rs, 'p1', ['libre1', 'fuera'])).toEqual(['a'])
  })
})
