const ALLOWED_XML_TYPES = ['text/xml', 'application/xml']
const ALLOWED_PDF_TYPES = ['application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export type FacturaValidationErrorCode =
  | 'XML_REQUIRED' | 'XML_INVALID_TYPE'
  | 'PDF_REQUIRED' | 'PDF_INVALID_TYPE'
  | 'FILE_TOO_LARGE'

export type FacturaValidationResult =
  | { ok: true }
  | { ok: false; code: FacturaValidationErrorCode; field: 'xml' | 'pdf' }

/**
 * Reglas de required/tipo/tamaño para subida de facturas, compartidas por
 * CxP, CxC y Portal (F19) -- cada ruta traduce el código a su propio
 * mensaje exacto, porque los 3 textos difieren entre sí. `pdfRequired:
 * false` (CxC) nunca produce PDF_REQUIRED.
 */
export function validateFacturaFiles(params: {
  xml: File | null
  pdf: File | null
  pdfRequired: boolean
}): FacturaValidationResult {
  const { xml, pdf, pdfRequired } = params

  if (!xml) return { ok: false, code: 'XML_REQUIRED', field: 'xml' }
  if (pdfRequired && !pdf) return { ok: false, code: 'PDF_REQUIRED', field: 'pdf' }

  if (!ALLOWED_XML_TYPES.includes(xml.type) && !xml.name.endsWith('.xml')) {
    return { ok: false, code: 'XML_INVALID_TYPE', field: 'xml' }
  }
  if (pdf && !ALLOWED_PDF_TYPES.includes(pdf.type) && !pdf.name.endsWith('.pdf')) {
    return { ok: false, code: 'PDF_INVALID_TYPE', field: 'pdf' }
  }

  if (xml.size > MAX_FILE_SIZE) return { ok: false, code: 'FILE_TOO_LARGE', field: 'xml' }
  if (pdf && pdf.size > MAX_FILE_SIZE) return { ok: false, code: 'FILE_TOO_LARGE', field: 'pdf' }

  return { ok: true }
}
