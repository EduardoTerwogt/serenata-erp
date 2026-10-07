/**
 * #123 (P4, P18, P24, T20): qué es un CFDI para Serenata y de quién. El RFC propio sale de la constancia fiscal
 * cargada en Admin (`datos-fiscales.ts`); aquí se recibe ya resuelto. Puro: no toca la base ni el servidor (lo prueba
 * `rfc.test.ts`).
 *
 * - Ingreso (I) emitido POR Serenata → factura de cliente; la contraparte es el receptor.
 * - Ingreso (I) emitido PARA Serenata → factura de proveedor; la contraparte es el emisor.
 * - Pago (P): el complemento va con el lado de la factura que relaciona: lo emite Serenata (cobro) o el proveedor.
 * - Egreso, traslado o nómina no entran como factura.
 */
import type { FacturaData } from '@/lib/server/xml/factura-parser'

export type TipoDocumentoCuentas = 'factura_cobro' | 'factura_proveedor' | 'complemento_cobro' | 'complemento_proveedor'

export type ClasificacionCfdi =
  | { ok: true; tipo: TipoDocumentoCuentas; lado: 'cobro' | 'proveedor'; rfcContraparte: string | null }
  | { ok: false; codigo: 'tipo_no_soportado' | 'rfc_ajeno'; mensaje: string }

export function normalizarRfc(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').trim().toUpperCase()
  return limpio === '' ? null : limpio
}

/**
 * #130: sugerencia de régimen del proveedor para prellenar su alta (el usuario la confirma). 626 es RESICO; en lo
 * demás decide la longitud del RFC (12 = moral, 13 = física). Con un RFC raro no se adivina: null.
 */
export function regimenSugerido(rfc: string | null | undefined, codigoRegimen: string | null | undefined): 'moral' | 'fisica' | 'resico' | null {
  if (codigoRegimen?.trim() === '626') return 'resico'
  const limpio = normalizarRfc(rfc)
  if (limpio?.length === 12) return 'moral'
  if (limpio?.length === 13) return 'fisica'
  return null
}

export function clasificarCfdi(data: Pick<FacturaData, 'tipo_comprobante' | 'rfc_emisor' | 'rfc_receptor'>, rfcPropio: string): ClasificacionCfdi {
  const propio = normalizarRfc(rfcPropio)
  const emisor = normalizarRfc(data.rfc_emisor)
  const receptor = normalizarRfc(data.rfc_receptor)
  // CFDI 3.3/4.0: el tipo siempre viene; sin él se trata como ingreso.
  const tipo = (data.tipo_comprobante ?? 'I').toUpperCase()

  if (tipo !== 'I' && tipo !== 'P') {
    return { ok: false, codigo: 'tipo_no_soportado', mensaje: `Solo se aceptan facturas (ingreso) y complementos de pago; este CFDI es de tipo ${tipo}.` }
  }
  const esEmisor = !!propio && emisor === propio
  const esReceptor = !!propio && receptor === propio
  if (esEmisor === esReceptor) {
    // Ni emisor ni receptor (o ambos): no es un documento de Serenata.
    const detalle = esEmisor
      ? 'Serenata aparece como emisor y como receptor.'
      : `El XML trae emisor ${emisor ?? 'sin RFC'} y receptor ${receptor ?? 'sin RFC'}; el RFC de Serenata registrado en Admin → Datos fiscales es ${propio ?? 'ninguno'}.`
    return { ok: false, codigo: 'rfc_ajeno', mensaje: `El XML no es de ni para Serenata: revisa que sea el archivo correcto. ${detalle}` }
  }
  const lado = esEmisor ? 'cobro' : 'proveedor'
  const rfcContraparte = esEmisor ? receptor : emisor
  return { ok: true, tipo: tipo === 'P' ? (lado === 'cobro' ? 'complemento_cobro' : 'complemento_proveedor') : lado === 'cobro' ? 'factura_cobro' : 'factura_proveedor', lado, rfcContraparte }
}

const FOLIO_SH = /\bSH\d{3,}(?:-[A-Z]+)?\b/gi

/** Folios de cotización (`SH061`, `SH071-A`) que menciona el texto de los conceptos; únicos y en mayúsculas (P4). */
export function foliosEnConceptos(conceptos: string[] | undefined): string[] {
  const vistos = new Set<string>()
  for (const texto of conceptos ?? []) {
    for (const m of Array.from(texto.matchAll(FOLIO_SH))) vistos.add(m[0].toUpperCase())
  }
  return Array.from(vistos)
}
