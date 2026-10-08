import { describe, expect, it } from 'vitest'
import { clasificarCfdi, foliosEnConceptos, normalizarRfc, regimenSugerido } from './rfc'

const SERENATA = 'SHO100101AB1'

describe('normalizarRfc', () => {
  it('recorta y pasa a mayúsculas; vacío es null', () => {
    expect(normalizarRfc('  xaxx010101000 ')).toBe('XAXX010101000')
    expect(normalizarRfc('   ')).toBeNull()
    expect(normalizarRfc(undefined)).toBeNull()
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

  it('el rechazo dice qué RFC trae el XML y cuál tiene registrado Serenata, para ver de inmediato si la constancia es otra', () => {
    const r = clasificarCfdi({ tipo_comprobante: 'I', rfc_emisor: 'aaa010101aaa', rfc_receptor: 'BBB010101BBB' }, SERENATA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.mensaje).toContain(`emisor AAA010101AAA y receptor BBB010101BBB; el RFC de Serenata registrado en Admin → Datos fiscales es ${SERENATA}`)
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

describe('regimenSugerido (#130)', () => {
  it('626 es RESICO; en lo demás decide la longitud del RFC', () => {
    expect(regimenSugerido('ALE211125DC7', '601')).toBe('moral')
    expect(regimenSugerido('LOPJ800101AB1', '612')).toBe('fisica')
    expect(regimenSugerido('LOPJ800101AB1', '626')).toBe('resico')
    expect(regimenSugerido(' ale211125dc7 ', null)).toBe('moral')
  })

  it('con un RFC que no es de 12 ni 13 no se adivina', () => {
    expect(regimenSugerido('ABC', '601')).toBeNull()
    expect(regimenSugerido(null, null)).toBeNull()
  })
})
