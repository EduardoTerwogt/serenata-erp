import { describe, expect, it } from 'vitest'
import type { EmisorPreview } from '@/lib/shared/cuentas/factura-preview-tipos'
import { ALTA_VACIA, armarProveedor, destinoInicial, erroresAlta, montoDeTexto, proveedorNuevo, type AltaForm, type DestinoProveedor } from '../destino-proveedor'

const emisor: EmisorPreview = { rfc: 'AAA010101AAA', nombre: 'Audio SA de CV', regimen_codigo: '601', regimen_sugerido: 'moral' }
const alta: AltaForm = { telefono: '5512345678', correo: 'pagos@audio.mx', banco: 'BBVA', clabe: '0123 4567 8901 2345 67' }
const destino = (d: Partial<DestinoProveedor> = {}): DestinoProveedor => ({ ...destinoInicial(), ...d })

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
    expect(armarProveedor(destino(), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false, falta: expect.stringContaining('proyecto') })
    expect(armarProveedor(destino({ grupoId: 'g1' }), { contraparteId: null, emisor })).toMatchObject({ ok: false, falta: 'Elige al proveedor' })
  })
  it('proveedor nuevo con renglones: manda el alta junto a los renglones y contraparte_id nulo', () => {
    const r = armarProveedor(destino({ modo: 'renglones', nuevo: true, alta, renglones: ['c1', 'c2'], proyectoRenglones: 'SH001' }), { contraparteId: null, emisor })
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
  it('gasto extra: pide proyecto, concepto y costo, y manda el costo numérico', () => {
    const gasto = { proyecto_id: 'SH002', proyecto: 'Boda', concepto: ' Renta de grúa ', costo: '5,800.00' }
    expect(armarProveedor(destino({ modo: 'gasto', gasto: { ...gasto, proyecto_id: null } }), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false, falta: 'Elige el proyecto del gasto' })
    expect(armarProveedor(destino({ modo: 'gasto', gasto: { ...gasto, concepto: ' ' } }), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false, falta: 'Escribe el concepto del gasto' })
    expect(armarProveedor(destino({ modo: 'gasto', gasto: { ...gasto, costo: '' } }), { contraparteId: 'p1', emisor })).toMatchObject({ ok: false, falta: 'Escribe el costo neto del gasto' })
    expect(armarProveedor(destino({ modo: 'gasto', gasto }), { contraparteId: 'p1', emisor })).toEqual({
      ok: true,
      cuerpo: { contraparte_id: 'p1', preparar: { proveedor: undefined, gasto: { proyecto_id: 'SH002', concepto: 'Renta de grúa', costo_total: 5800 } } },
    })
  })
})
