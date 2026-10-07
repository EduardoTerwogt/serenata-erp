import { afterEach, describe, expect, it } from 'vitest'
import { DomainError } from '@/lib/server/errors/domain-error'
import { clasificarCfdi, foliosEnConceptos, normalizarRfc, serenataRfc } from './rfc'

const SERENATA = 'SHO100101AB1'

describe('normalizarRfc', () => {
  it('recorta y pasa a mayúsculas; vacío es null', () => {
    expect(normalizarRfc('  xaxx010101000 ')).toBe('XAXX010101000')
    expect(normalizarRfc('   ')).toBeNull()
    expect(normalizarRfc(undefined)).toBeNull()
  })
})

describe('serenataRfc (T20)', () => {
  const original = process.env.SERENATA_RFC
  afterEach(() => {
    if (original === undefined) delete process.env.SERENATA_RFC
    else process.env.SERENATA_RFC = original
  })

  it('lee la variable normalizada', () => {
    process.env.SERENATA_RFC = ' sho100101ab1 '
    expect(serenataRfc()).toBe(SERENATA)
  })

  it('si falta, falla explícito con un DomainError 500 (no valida en silencio)', () => {
    delete process.env.SERENATA_RFC
    expect(() => serenataRfc()).toThrow(DomainError)
    try {
      serenataRfc()
    } catch (e) {
      expect((e as DomainError).status).toBe(500)
      expect((e as DomainError).code).toBe('serenata_rfc_faltante')
    }
    process.env.SERENATA_RFC = '   '
    expect(() => serenataRfc()).toThrow(DomainError)
  })
})

describe('clasificarCfdi (P18)', () => {
  it('ingreso emitido por Serenata: factura de cliente, la contraparte es el receptor', () => {
    expect(clasificarCfdi({ tipo_comprobante: 'I', rfc_emisor: SERENATA, rfc_receptor: 'CLI010101AAA' }, SERENATA)).toEqual({
      ok: true, tipo: 'factura_cobro', lado: 'cobro', rfcContraparte: 'CLI010101AAA',
    })
  })

  it('ingreso emitido para Serenata: factura de proveedor, la contraparte es el emisor', () => {
    expect(clasificarCfdi({ tipo_comprobante: 'I', rfc_emisor: 'prov010101aaa', rfc_receptor: SERENATA }, SERENATA)).toEqual({
      ok: true, tipo: 'factura_proveedor', lado: 'proveedor', rfcContraparte: 'PROV010101AAA',
    })
  })

  it('sin TipoDeComprobante se trata como ingreso', () => {
    const r = clasificarCfdi({ rfc_emisor: SERENATA, rfc_receptor: 'CLI010101AAA' }, SERENATA)
    expect(r).toMatchObject({ ok: true, tipo: 'factura_cobro' })
  })

  it('complemento de pago: el lado lo da quién lo emite', () => {
    expect(clasificarCfdi({ tipo_comprobante: 'P', rfc_emisor: SERENATA, rfc_receptor: 'CLI010101AAA' }, SERENATA)).toMatchObject({ ok: true, tipo: 'complemento_cobro', lado: 'cobro' })
    expect(clasificarCfdi({ tipo_comprobante: 'P', rfc_emisor: 'PROV010101AAA', rfc_receptor: SERENATA }, SERENATA)).toMatchObject({ ok: true, tipo: 'complemento_proveedor', lado: 'proveedor' })
  })

  it('un RFC que no es de Serenata en ningún extremo se rechaza', () => {
    const r = clasificarCfdi({ tipo_comprobante: 'I', rfc_emisor: 'AAA010101AAA', rfc_receptor: 'BBB010101BBB' }, SERENATA)
    expect(r).toMatchObject({ ok: false, codigo: 'rfc_ajeno' })
  })

  it('autofactura (Serenata en ambos extremos) también se rechaza', () => {
    expect(clasificarCfdi({ tipo_comprobante: 'I', rfc_emisor: SERENATA, rfc_receptor: SERENATA }, SERENATA)).toMatchObject({ ok: false, codigo: 'rfc_ajeno' })
  })

  it('egreso, traslado y nómina no entran', () => {
    for (const t of ['E', 'T', 'N']) {
      expect(clasificarCfdi({ tipo_comprobante: t, rfc_emisor: SERENATA, rfc_receptor: 'CLI010101AAA' }, SERENATA)).toMatchObject({ ok: false, codigo: 'tipo_no_soportado' })
    }
  })
})

describe('foliosEnConceptos (P4)', () => {
  it('encuentra folios SH y complementarias, únicos y en mayúsculas', () => {
    expect(foliosEnConceptos(['Producción SH061', 'sh062-a y SH061', 'Pago de SH1000'])).toEqual(['SH061', 'SH062-A', 'SH1000'])
  })

  it('un concepto genérico no preselecciona nada', () => {
    expect(foliosEnConceptos(['Servicios de producción audiovisual', 'SHOW 2026', 'SH12'])).toEqual([])
    expect(foliosEnConceptos(undefined)).toEqual([])
  })
})
