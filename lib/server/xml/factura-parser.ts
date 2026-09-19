/**
 * XML CFDI parser para facturas electrónicas
 */

import { XMLParser, XMLValidator } from 'fast-xml-parser'

export interface FacturaData {
  folio?: string
  fecha_emision?: string
  monto_total?: number
  subtotal?: number
  rfc_emisor?: string
  rfc_receptor?: string
  uuid_timbrado?: string
  // Desglose fiscal (Fase 5.3 Bloque 0, punto 3): suma de los nodos
  // cfdi:Traslado / cfdi:Retencion por tipo de impuesto (002 = IVA,
  // 001 = ISR). 0 cuando el CFDI no trae el nodo correspondiente --
  // legítimo para un proveedor persona moral, que no lleva retenciones.
  iva_trasladado?: number
  iva_retenido?: number
  isr_retenido?: number
  error?: string
}

// Parser XML real (no regex) -- ver nota de diseño larga en parseFacturaXML
// sobre por qué se migró de extracción por regex a un parser de verdad.
// `removeNSPrefix` quita el prefijo de namespace de tags Y atributos
// (cfdi:Comprobante -> Comprobante, tfd:TimbreFiscalDigital ->
// TimbreFiscalDigital) sin importar qué prefijo use el PAC/emisor.
// `isArray` fuerza array SIEMPRE para Traslado/Retencion -- sin esto,
// fast-xml-parser da un objeto suelto cuando hay un solo nodo y un array
// cuando hay más de uno, y el código de suma tendría que ramificar por caso.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: true,
  parseAttributeValue: false,
  isArray: (tagName) => tagName === 'Traslado' || tagName === 'Retencion',
})

interface ImpuestoNodo {
  Impuesto?: string
  Importe?: string
}

function sumImporteByImpuesto(nodos: ImpuestoNodo[] | undefined, codigoImpuesto: string): number {
  return (nodos ?? [])
    .filter((n) => n.Impuesto === codigoImpuesto)
    .reduce((sum, n) => sum + (parseFloat(n.Importe ?? '') || 0), 0)
}

export type CampoMismatchFactura =
  | 'lectura_xml'
  | 'subtotal'
  | 'iva_trasladado'
  | 'iva_retenido'
  | 'isr_retenido'
  | 'total_vs_desglose'

export interface MismatchFactura {
  campo: CampoMismatchFactura
  mensaje: string
}

export interface ResultadoValidacionFactura {
  estado_validacion: 'validado' | 'revision'
  detalle_validacion: string | null
  // Solo poblado por validarFacturaFiscalProveedor() -- permite a un caller
  // (el wrapper del Portal) distinguir un mismatch de subtotal (mensaje
  // genérico al proveedor) de uno de desglose (mensaje específico), sin
  // reparsear detalle_validacion.
  mismatches?: MismatchFactura[]
}

/**
 * Parsea un XML de factura CFDI y extrae datos clave.
 *
 * Parser XML real (fast-xml-parser), no regex sobre el texto. El intento
 * original con regex funcionaba para lecturas de un solo atributo plano
 * (Folio, Total...) pero no entiende jerarquía/anidamiento -- eso causó un
 * bug real (reportado 2026-09-19, folio 369): un CFDI válido trae los nodos
 * Traslado/Retencion DOS VECES (una por cada Concepto, desglose por
 * renglón, y otra en el Impuestos a nivel Comprobante, resumen agregado) y
 * sumar por regex sobre el XML completo contaba ambas, duplicando el monto
 * ($6,400.00 leído cuando el XML declaraba $3,200.00). Un parser real
 * elimina esa clase de bug por construcción: `comprobante.Impuestos` es
 * inequívocamente el nodo hermano de `comprobante.Conceptos`, nunca lo que
 * hay adentro de cada Concepto ni de Complemento -- no hace falta ninguna
 * regla de "acotar el texto a partir de tal cierre de tag".
 *
 * `removeNSPrefix` hace esto además independiente del prefijo de namespace
 * que use el PAC/emisor (cfdi:, algún otro) y el esquema (CFDI 3.3 y 4.0
 * comparten los mismos nombres de atributo: Folio, Fecha, Total, SubTotal,
 * Rfc, Impuesto, Importe -- son parte del XSD que exige el SAT para poder
 * timbrar, no varían por proveedor).
 */
export function parseFacturaXML(xmlContent: string): FacturaData {
  const validacion = XMLValidator.validate(xmlContent)
  if (validacion !== true) {
    return { error: `XML mal formado: ${validacion.err?.msg ?? 'estructura inválida'}` }
  }

  try {
    const parsed = xmlParser.parse(xmlContent)
    const comprobante = parsed?.Comprobante
    if (!comprobante || typeof comprobante !== 'object') {
      return { error: 'El XML no contiene un nodo Comprobante válido' }
    }

    const folio: string | undefined = comprobante.Folio
    const fecha = typeof comprobante.Fecha === 'string' ? comprobante.Fecha.split('T')[0] : undefined
    const monto = comprobante.Total != null ? parseFloat(comprobante.Total) : undefined
    const subtotal = comprobante.SubTotal != null ? parseFloat(comprobante.SubTotal) : undefined

    // RFC emisor/receptor y UUID de timbrado -- informativos por ahora: no
    // hay un RFC esperado guardado en clientes/proveedores todavía, así que
    // no bloquean la validación, solo se extraen para mostrarse en el
    // detalle del documento.
    const rfcEmisor: string | undefined = comprobante.Emisor?.Rfc
    const rfcReceptor: string | undefined = comprobante.Receptor?.Rfc
    const uuid: string | undefined = comprobante.Complemento?.TimbreFiscalDigital?.UUID

    // Desglose fiscal -- Impuesto 002 = IVA, 001 = ISR (catálogo c_Impuesto
    // del SAT). Ambos nodos son opcionales en el CFDI: un proveedor persona
    // moral típicamente no trae Retenciones. Lee EXCLUSIVAMENTE
    // comprobante.Impuestos (nunca desciende a Conceptos ni a Complemento).
    const traslados: ImpuestoNodo[] | undefined = comprobante.Impuestos?.Traslados?.Traslado
    const retenciones: ImpuestoNodo[] | undefined = comprobante.Impuestos?.Retenciones?.Retencion
    const ivaTrasladado = sumImporteByImpuesto(traslados, '002')
    const ivaRetenido = sumImporteByImpuesto(retenciones, '002')
    const isrRetenido = sumImporteByImpuesto(retenciones, '001')

    // Validar que al menos tengamos folio y fecha
    if (!folio || !fecha) {
      return {
        error: 'No se pudieron extraer folio y/o fecha del XML'
      }
    }

    return {
      folio,
      fecha_emision: fecha,
      monto_total: monto || 0,
      subtotal,
      rfc_emisor: rfcEmisor,
      rfc_receptor: rfcReceptor,
      uuid_timbrado: uuid,
      iva_trasladado: ivaTrasladado,
      iva_retenido: ivaRetenido,
      isr_retenido: isrRetenido,
    }
  } catch (err) {
    return {
      error: `Error parseando XML: ${err instanceof Error ? err.message : 'desconocido'}`
    }
  }
}

const TOLERANCIA_CENTAVOS = 0.01

/**
 * Validación estructural automática de una factura al cliente (FACTURA_XML,
 * cuentas_cobrar): el único monto esperado documentado es el total de la
 * cuenta -- no hay RFC de cliente guardado todavía (llegará con el Portal de
 * Proveedores/clientes), así que RFC y UUID solo se muestran, no bloquean.
 */
export function validarFacturaClienteXML(facturaData: FacturaData, montoEsperado: number): ResultadoValidacionFactura {
  if (facturaData.monto_total == null) {
    return { estado_validacion: 'revision', detalle_validacion: 'No se pudo leer el monto total del XML.' }
  }
  const diferencia = Math.abs(facturaData.monto_total - montoEsperado)
  if (diferencia > TOLERANCIA_CENTAVOS) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: `Monto no coincide: XML $${facturaData.monto_total.toFixed(2)} vs cuenta $${montoEsperado.toFixed(2)}.`,
    }
  }
  return { estado_validacion: 'validado', detalle_validacion: null }
}

/**
 * Valida que el monto de la factura coincida con el monto de la cotización
 */
export function validarMontoFactura(montoFactura: number, montoCotizacion: number): {
  coincide: boolean
  diferencia: number
} {
  const diferencia = Math.abs(montoFactura - montoCotizacion)
  const coincide = diferencia < 0.01 // Tolerancia de 1 centavo
  return { coincide, diferencia }
}

/**
 * Calcula el deadline de pago (fecha + 30 días)
 */
export function calcularDeadline(fechaEmision: string): string {
  const fecha = new Date(fechaEmision)
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`No se pudo calcular la fecha de vencimiento: "${fechaEmision}" no es una fecha válida`)
  }
  fecha.setDate(fecha.getDate() + 30)
  return fecha.toISOString().split('T')[0]
}
