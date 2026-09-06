/**
 * XML CFDI parser para facturas electrónicas
 */

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

// Extrae todas las ocurrencias de un tag autocontenido (p. ej.
// <cfdi:Traslado Impuesto="002" Importe="160.00" />) y regresa sus atributos
// como objetos, sin depender del orden en que aparezcan los atributos.
function extractTagAttrs(xmlContent: string, tagName: string): Record<string, string>[] {
  const tagRegex = new RegExp(`<(?:\\w+:)?${tagName}\\b([^>]*)/?>`, 'gi')
  const attrRegex = /([\w:]+)\s*=\s*["']([^"']*)["']/g
  const results: Record<string, string>[] = []
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = tagRegex.exec(xmlContent)) !== null) {
    const attrs: Record<string, string> = {}
    let attrMatch: RegExpExecArray | null
    attrRegex.lastIndex = 0
    while ((attrMatch = attrRegex.exec(tagMatch[1])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2]
    }
    results.push(attrs)
  }
  return results
}

function sumImporteByImpuesto(tags: Record<string, string>[], codigoImpuesto: string): number {
  return tags
    .filter((t) => t.Impuesto === codigoImpuesto)
    .reduce((sum, t) => sum + (parseFloat(t.Importe) || 0), 0)
}

export interface ResultadoValidacionFactura {
  estado_validacion: 'validado' | 'revision'
  detalle_validacion: string | null
}

/**
 * Parsea un XML de factura CFDI y extrae datos clave
 */
export function parseFacturaXML(xmlContent: string): FacturaData {
  try {
    // Extraer folio - buscar en atributo Folio del Comprobante
    const folioMatch = xmlContent.match(/Folio\s*=\s*["']([^"']+)["']/)
    const folio = folioMatch?.[1]

    // Extraer fecha - buscar en atributo Fecha
    const fechaMatch = xmlContent.match(/Fecha\s*=\s*["']([^"']+)["']/)
    const fecha = fechaMatch?.[1]?.split('T')?.[0]

    // Extraer monto total - buscar Total del Comprobante.
    // No basta con /Total\s*=\s*.../: "SubTotal" contiene "Total" como substring, y en
    // cualquier CFDI real SubTotal aparece antes que Total en el XML, así que un regex sin
    // anclar hace match con SubTotal primero. El lookbehind exige que "Total" no esté
    // precedido por una letra (descarta "SubTotal").
    const montoMatch = xmlContent.match(/(?<![a-zA-Z])Total\s*=\s*["']([^"']+)["']/)
    const monto = montoMatch ? parseFloat(montoMatch[1]) : undefined

    // SubTotal -- mismo cuidado que Total: no hay substring conflictivo en
    // este caso, pero se ancla igual por consistencia.
    const subtotalMatch = xmlContent.match(/(?<![a-zA-Z])SubTotal\s*=\s*["']([^"']+)["']/)
    const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1]) : undefined

    // RFC emisor/receptor y UUID de timbrado -- informativos por ahora: no
    // hay un RFC esperado guardado en clientes/proveedores todavía, así que
    // no bloquean la validación, solo se extraen para mostrarse en el
    // detalle del documento.
    const rfcEmisorMatch = xmlContent.match(/<cfdi:Emisor\b[^>]*\bRfc\s*=\s*["']([^"']+)["']/i)
    const rfcReceptorMatch = xmlContent.match(/<cfdi:Receptor\b[^>]*\bRfc\s*=\s*["']([^"']+)["']/i)
    const uuidMatch = xmlContent.match(/<tfd:TimbreFiscalDigital\b[^>]*\bUUID\s*=\s*["']([^"']+)["']/i)

    // Desglose fiscal -- Impuesto 002 = IVA, 001 = ISR (catálogo c_Impuesto
    // del SAT). Ambos nodos son opcionales en el CFDI: un proveedor persona
    // moral típicamente no trae cfdi:Retenciones.
    const traslados = extractTagAttrs(xmlContent, 'Traslado')
    const retenciones = extractTagAttrs(xmlContent, 'Retencion')
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
      rfc_emisor: rfcEmisorMatch?.[1],
      rfc_receptor: rfcReceptorMatch?.[1],
      uuid_timbrado: uuidMatch?.[1],
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
