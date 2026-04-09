/**
 * XML CFDI parser para facturas electrónicas
 */

export interface FacturaData {
  folio?: string
  fecha_emision?: string
  monto_total?: number
  error?: string
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

    // Extraer monto total - buscar Total del Comprobante
    const montoMatch = xmlContent.match(/Total\s*=\s*["']([^"']+)["']/)
    const monto = montoMatch ? parseFloat(montoMatch[1]) : undefined

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
    }
  } catch (err) {
    return {
      error: `Error parseando XML: ${err instanceof Error ? err.message : 'desconocido'}`
    }
  }
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
  fecha.setDate(fecha.getDate() + 30)
  return fecha.toISOString().split('T')[0]
}
