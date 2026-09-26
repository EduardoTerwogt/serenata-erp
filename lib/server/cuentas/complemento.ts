/**
 * Rediseño de Cuentas B1 (docs/PLAN.md, S8, D16, D27): reglas puras del
 * complemento de pago, separadas de la ruta para probarlas sin Drive ni BD.
 */
import type { DocumentoCuentaCobrar, PagoComprobante } from '@/lib/types'

export type TipoArchivoComplemento = 'COMPLEMENTO_PAGO' | 'COMPLEMENTO_PAGO_PDF'

/**
 * S8: sin `pago_id`, el archivo se asigna al pago más reciente (por fecha de
 * pago y luego por alta) que todavía no tenga ese tipo de archivo. Con
 * `pago_id`, ese pago tiene que ser de la cuenta. Devuelve null si no hay a
 * qué pago vincularlo.
 */
export function elegirPagoParaComplemento(params: {
  pagos: PagoComprobante[]
  documentos: DocumentoCuentaCobrar[]
  tipo: TipoArchivoComplemento
  pagoId?: string | null
}): PagoComprobante | null | 'pago_ajeno' {
  const { pagos, documentos, tipo, pagoId } = params
  if (pagoId) {
    return pagos.find((p) => p.id === pagoId) ?? 'pago_ajeno'
  }
  const conArchivo = new Set(documentos.filter((d) => d.tipo === tipo && d.pago_id).map((d) => d.pago_id as string))
  const candidatos = pagos
    .filter((p) => !conArchivo.has(p.id))
    .sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  return candidatos[0] ?? null
}

/** Factura XML vigente de la cuenta (T7): la más reciente por fecha de carga. */
export function facturaXmlVigente(documentos: DocumentoCuentaCobrar[]): DocumentoCuentaCobrar | null {
  const facturas = documentos.filter((d) => d.tipo === 'FACTURA_XML')
  if (facturas.length === 0) return null
  return facturas.reduce((a, b) => (b.fecha_carga > a.fecha_carga ? b : a))
}
