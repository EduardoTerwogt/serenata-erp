const ALLOWED_XML_TYPES = ['text/xml', 'application/xml']
const ALLOWED_PDF_TYPES = ['application/pdf']
// Rediseño de Cuentas (supuesto 15): 4 MB por archivo. Una función de Vercel
// no acepta cuerpos de más de ~4.5 MB, así que (salvo Subir factura, #131, con su tope combinado) XML y PDF viajan en
// peticiones separadas y cada uno cabe con margen.
export const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4 MB
export const MENSAJE_LIMITE = 'El archivo excede el límite de 4 MB'
// #131 (Subir factura): con el PDF obligatorio, XML y PDF viajan en la misma petición. El tope combinado deja margen para
// el cuerpo multipart y el JSON de `datos` bajo el límite de ~4.5 MB de Vercel.
export const MAX_TOTAL_SIZE = 4.2 * 1024 * 1024
export const MENSAJE_LIMITE_TOTAL = 'El XML y el PDF juntos exceden 4 MB. Reduce el PDF.'

export const excedeTotal = (xml: File, pdf: File | null): boolean => xml.size + (pdf?.size ?? 0) > MAX_TOTAL_SIZE

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
