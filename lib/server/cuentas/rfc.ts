/**
 * #123 (P4, P18, P24, T20): qué es un CFDI para Serenata y de quién. El RFC propio vive en la variable de entorno
 * `SERENATA_RFC` (no hay tabla de configuración); si falta, las rutas de factura FALLAN explícito, no validan en
 * silencio. Puro: no toca la base ni el servidor (lo prueba `rfc.test.ts`).
 *
 * - Ingreso (I) emitido POR Serenata → factura de cliente; la contraparte es el receptor.
 * - Ingreso (I) emitido PARA Serenata → factura de proveedor; la contraparte es el emisor.
 * - Pago (P): el complemento va con el lado de la factura que relaciona: lo emite Serenata (cobro) o el proveedor.
 * - Egreso, traslado o nómina no entran como factura.
 */
import { DomainError } from '@/lib/server/errors/domain-error'
import type { FacturaData } from '@/lib/server/xml/factura-parser'

export type TipoDocumentoCuentas = 'factura_cobro' | 'factura_proveedor' | 'complemento_cobro' | 'complemento_proveedor'

export type ClasificacionCfdi =
  | { ok: true; tipo: TipoDocumentoCuentas; lado: 'cobro' | 'proveedor'; rfcContraparte: string | null }
  | { ok: false; codigo: 'tipo_no_soportado' | 'rfc_ajeno'; mensaje: string }

export function normalizarRfc(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').trim().toUpperCase()
  return limpio === '' ? null : limpio
}

/** El RFC de Serenata House. Falla explícito (500) si la variable no está configurada (T20). */
export function serenataRfc(): string {
  const rfc = normalizarRfc(process.env.SERENATA_RFC)
  if (!rfc) {
    throw new DomainError({
      code: 'serenata_rfc_faltante',
      status: 500,
      safeMessage: 'Falta configurar el RFC de Serenata (SERENATA_RFC); avisa a quien administra el sistema.',
    })
  }
  return rfc
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
    return { ok: false, codigo: 'rfc_ajeno', mensaje: 'El XML no es de ni para Serenata: revisa que sea el archivo correcto.' }
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
