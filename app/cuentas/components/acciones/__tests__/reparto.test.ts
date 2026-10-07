import { describe, expect, it } from 'vitest'
import { aCentavos, parseMonto, resumirReparto, sugerirReparto, textoMonto } from '../reparto'

describe('parseMonto', () => {
  it('lee montos con separadores y a lo más dos decimales', () => {
    expect(parseMonto('300000')).toBe(30000000)
    expect(parseMonto('1,234.50')).toBe(123450)
    expect(parseMonto('$ 96,280.00')).toBe(9628000)
    expect(parseMonto('.5')).toBe(50)
  })
  it('rechaza vacío, texto y más de dos decimales (no redondea en silencio)', () => {
    expect(parseMonto('')).toBeNull()
    expect(parseMonto('.')).toBeNull()
    expect(parseMonto('abc')).toBeNull()
    expect(parseMonto('10.005')).toBeNull()
  })
})

describe('aCentavos / textoMonto', () => {
  it('no pierde centavos por flotantes', () => {
    expect(aCentavos(0.1 + 0.2)).toBe(30)
    expect(aCentavos(1.005 * 100)).toBe(10050)
    expect(textoMonto(123450)).toBe('1234.50')
  })
})

describe('sugerirReparto (la más antigua primero)', () => {
  const lineas = [
    { id: 'SH001', saldo: 18560000 },
    { id: 'SH003', saldo: 5800000 },
    { id: 'SH004', saldo: 4640000 },
    { id: 'SH006', saldo: 6960000 },
  ]
  it('llena cada línea hasta su saldo en el orden recibido', () => {
    const r = sugerirReparto(30000000, lineas)
    expect(r).toEqual({ SH001: 18560000, SH003: 5800000, SH004: 4640000, SH006: 1000000 })
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(30000000)
  })
  it('un monto menor al primer saldo solo toca la primera línea', () => {
    expect(sugerirReparto(100000, lineas)).toEqual({ SH001: 100000 })
  })
  it('un monto mayor a todo el saldo deja el excedente sin aplicar', () => {
    const r = sugerirReparto(99999999, lineas)
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(35960000)
  })
  it('residuo de centavos: nada se pierde ni se duplica', () => {
    const r = sugerirReparto(100, [
      { id: 'a', saldo: 33 },
      { id: 'b', saldo: 33 },
      { id: 'c', saldo: 33 },
      { id: 'd', saldo: 33 },
    ])
    expect(r).toEqual({ a: 33, b: 33, c: 33, d: 1 })
  })
  it('monto cero o negativo no aplica nada', () => {
    expect(sugerirReparto(0, lineas)).toEqual({})
    expect(sugerirReparto(-5, lineas)).toEqual({})
  })
})

describe('resumirReparto', () => {
  const lineas = [
    { id: 'a', saldo: 1000 },
    { id: 'b', saldo: 500 },
  ]
  it('cuadra cuando lo aplicado es igual al monto', () => {
    const r = resumirReparto(1200, { a: 1000, b: 200 }, lineas)
    expect(r).toEqual({ aplicado: 1200, porAplicar: 0, excedidas: [], lineas: 2 })
  })
  it('marca por aplicar y de más', () => {
    expect(resumirReparto(1500, { a: 1000 }, lineas).porAplicar).toBe(500)
    expect(resumirReparto(100, { a: 1000 }, lineas).porAplicar).toBe(-900)
  })
  it('detecta líneas que pasan de su saldo', () => {
    expect(resumirReparto(1600, { a: 1000, b: 600 }, lineas).excedidas).toEqual(['b'])
  })
})
