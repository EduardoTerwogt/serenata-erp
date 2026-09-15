import { describe, expect, it } from 'vitest'
import { validateFacturaFiles } from '../factura-validation'

function xmlFile(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  const name = overrides.name ?? 'factura.xml'
  const type = overrides.type ?? 'text/xml'
  const content = overrides.size !== undefined ? new Uint8Array(overrides.size) : new Uint8Array([1])
  return new File([content], name, { type })
}

function pdfFile(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  const name = overrides.name ?? 'factura.pdf'
  const type = overrides.type ?? 'application/pdf'
  const content = overrides.size !== undefined ? new Uint8Array(overrides.size) : new Uint8Array([1])
  return new File([content], name, { type })
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

describe('validateFacturaFiles', () => {
  it('ok con XML y PDF válidos cuando pdfRequired=true', () => {
    expect(validateFacturaFiles({ xml: xmlFile(), pdf: pdfFile(), pdfRequired: true })).toEqual({ ok: true })
  })

  it('ok con solo XML cuando pdfRequired=false', () => {
    expect(validateFacturaFiles({ xml: xmlFile(), pdf: null, pdfRequired: false })).toEqual({ ok: true })
  })

  it('ok con XML y PDF cuando pdfRequired=false (PDF opcional pero presente)', () => {
    expect(validateFacturaFiles({ xml: xmlFile(), pdf: pdfFile(), pdfRequired: false })).toEqual({ ok: true })
  })

  it('XML_REQUIRED cuando falta el XML, sin importar pdfRequired', () => {
    expect(validateFacturaFiles({ xml: null, pdf: pdfFile(), pdfRequired: true })).toEqual({ ok: false, code: 'XML_REQUIRED', field: 'xml' })
    expect(validateFacturaFiles({ xml: null, pdf: null, pdfRequired: false })).toEqual({ ok: false, code: 'XML_REQUIRED', field: 'xml' })
  })

  it('PDF_REQUIRED cuando falta el PDF y pdfRequired=true', () => {
    expect(validateFacturaFiles({ xml: xmlFile(), pdf: null, pdfRequired: true })).toEqual({ ok: false, code: 'PDF_REQUIRED', field: 'pdf' })
  })

  it('nunca emite PDF_REQUIRED cuando pdfRequired=false, aunque falte el PDF', () => {
    const result = validateFacturaFiles({ xml: xmlFile(), pdf: null, pdfRequired: false })
    expect(result.ok).toBe(true)
  })

  it('XML_INVALID_TYPE por MIME incorrecto sin extensión .xml de respaldo', () => {
    expect(validateFacturaFiles({ xml: xmlFile({ type: 'application/octet-stream', name: 'factura.bin' }), pdf: pdfFile(), pdfRequired: true }))
      .toEqual({ ok: false, code: 'XML_INVALID_TYPE', field: 'xml' })
  })

  it('acepta XML por extensión .xml aunque el MIME no esté en la lista permitida', () => {
    const result = validateFacturaFiles({ xml: xmlFile({ type: 'application/octet-stream', name: 'factura.xml' }), pdf: pdfFile(), pdfRequired: true })
    expect(result.ok).toBe(true)
  })

  it('PDF_INVALID_TYPE por MIME incorrecto sin extensión .pdf de respaldo (pdfRequired=true)', () => {
    expect(validateFacturaFiles({ xml: xmlFile(), pdf: pdfFile({ type: 'application/octet-stream', name: 'factura.bin' }), pdfRequired: true }))
      .toEqual({ ok: false, code: 'PDF_INVALID_TYPE', field: 'pdf' })
  })

  it('PDF_INVALID_TYPE también se evalúa cuando pdfRequired=false pero se mandó un PDF inválido', () => {
    expect(validateFacturaFiles({ xml: xmlFile(), pdf: pdfFile({ type: 'application/octet-stream', name: 'factura.bin' }), pdfRequired: false }))
      .toEqual({ ok: false, code: 'PDF_INVALID_TYPE', field: 'pdf' })
  })

  it('acepta PDF por extensión .pdf aunque el MIME no esté en la lista permitida', () => {
    const result = validateFacturaFiles({ xml: xmlFile(), pdf: pdfFile({ type: 'application/octet-stream', name: 'factura.pdf' }), pdfRequired: true })
    expect(result.ok).toBe(true)
  })

  it('FILE_TOO_LARGE cuando el XML excede el límite', () => {
    expect(validateFacturaFiles({ xml: xmlFile({ size: MAX_FILE_SIZE + 1 }), pdf: pdfFile(), pdfRequired: true }))
      .toEqual({ ok: false, code: 'FILE_TOO_LARGE', field: 'xml' })
  })

  it('FILE_TOO_LARGE cuando el PDF excede el límite', () => {
    expect(validateFacturaFiles({ xml: xmlFile(), pdf: pdfFile({ size: MAX_FILE_SIZE + 1 }), pdfRequired: true }))
      .toEqual({ ok: false, code: 'FILE_TOO_LARGE', field: 'pdf' })
  })

  it('el límite de tamaño no se evalúa contra un PDF ausente cuando pdfRequired=false', () => {
    const result = validateFacturaFiles({ xml: xmlFile(), pdf: null, pdfRequired: false })
    expect(result.ok).toBe(true)
  })
})
