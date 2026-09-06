/**
 * XML CFDI parser para facturas electrónicas
 */

export interface FacturaData {
  folio?: string
  fecha_emision?: string
  monto_total?: number
  rfc_emisor?: string
  rfc_receptor?: string
  uuid_timbrado?: string
  error?: string
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

    // RFC emisor/receptor y UUID de timbrado -- informativos por ahora (ver
    // nota en validarFacturaProveedorXML): no hay un RFC esperado guardado
    // en clientes/proveedores todavía, así que no bloquean la validación,
    // solo se extraen para mostrarse en el detalle del documento.
    const rfcEmisorMatch = xmlContent.match(/<cfdi:Emisor\b[^>]*\bRfc\s*=\s*["']([^"']+)["']/i)
    const rfcReceptorMatch = xmlContent.match(/<cfdi:Receptor\b[^>]*\bRfc\s*=\s*["']([^"']+)["']/i)
    const uuidMatch = xmlContent.match(/<tfd:TimbreFiscalDigital\b[^>]*\bUUID\s*=\s*["']([^"']+)["']/i)

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
      rfc_emisor: rfcEmisorMatch?.[1],
      rfc_receptor: rfcReceptorMatch?.[1],
      uuid_timbrado: uuidMatch?.[1],
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
 * Validación estructural automática de una factura de proveedor
 * (FACTURA_PROVEEDOR_XML, cuentas_pagar). El monto esperado en el XML es
 * el neto (x_pagar) + IVA trasladado 16% -- ese 16% es igual en los dos
 * escenarios fiscales del negocio (persona moral y persona física con
 * honorarios, ver readme del skill de diseño); lo que cambia entre
 * regímenes es la retención que Serenata aplica al TRANSFERIR el pago
 * (cruce fiscal en Cuentas), no lo que el proveedor declara como Total en
 * su propio CFDI. Por eso el régimen fiscal no participa de esta
 * comparación -- se valida el mismo monto esperado para ambos.
 */
export function validarFacturaProveedorXML(facturaData: FacturaData, montoNetoEsperado: number): ResultadoValidacionFactura {
  if (facturaData.monto_total == null) {
    return { estado_validacion: 'revision', detalle_validacion: 'No se pudo leer el monto total del XML.' }
  }
  const montoEsperadoConIva = Math.round(montoNetoEsperado * 1.16 * 100) / 100
  const diferencia = Math.abs(facturaData.monto_total - montoEsperadoConIva)
  if (diferencia > TOLERANCIA_CENTAVOS) {
    return {
      estado_validacion: 'revision',
      detalle_validacion: `Monto no coincide: XML $${facturaData.monto_total.toFixed(2)} vs esperado $${montoEsperadoConIva.toFixed(2)} (neto $${montoNetoEsperado.toFixed(2)} + IVA 16%).`,
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
