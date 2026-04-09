/**
 * Parseador simple para facturas XML CFDI
 * Extrae: fecha de emisión, folio, y monto total
 */

export interface FacturaData {
  fecha_emision: string | null
  folio: string | null
  monto_total: number | null
  error?: string
}

/**
 * Parsea un archivo XML de factura y extrae datos relevantes
 * Busca:
 * - Fecha en atributo "Fecha" o "fecha" del nodo raíz
 * - Folio en atributo "Folio" o "folio"
 * - Monto Total en atributo "Total" o "total"
 */
export async function parseFacturaXML(xmlContent: string): Promise<FacturaData> {
  try {
    // Simple regex-based parsing (no librería XML requerida)
    // Buscar Fecha
    const fechaMatch = xmlContent.match(/Fecha\s*=\s*["']([^"']+)["']/i)
    const fecha = fechaMatch ? fechaMatch[1] : null

    // Buscar Folio
    const folioMatch = xmlContent.match(/Folio\s*=\s*["']([^"']+)["']/i)
    const folio = folioMatch ? folioMatch[1] : null

    // Buscar Total
    const totalMatch = xmlContent.match(/Total\s*=\s*["']([0-9.]+)["']/i)
    const monto = totalMatch ? parseFloat(totalMatch[1]) : null

    return {
      fecha_emision: fecha,
      folio: folio,
      monto_total: monto,
    }
  } catch (error) {
    return {
      fecha_emision: null,
      folio: null,
      monto_total: null,
      error: `Error parseando XML: ${error instanceof Error ? error.message : 'desconocido'}`,
    }
  }
}

/**
 * Valida que el monto de la factura coincida con el monto de la cotización
 * Retorna true si coinciden, false si hay discrepancia
 */
export function validarMontoFactura(montoFactura: number | null, montoCotizacion: number, tolerancia: number = 0.01): {
  valido: boolean
  mensaje: string
} {
  if (montoFactura === null) {
    return {
      valido: false,
      mensaje: 'No se pudo extraer el monto de la factura',
    }
  }

  const diferencia = Math.abs(montoFactura - montoCotizacion)
  if (diferencia <= tolerancia) {
    return {
      valido: true,
      mensaje: `Monto coincide: $${montoFactura.toFixed(2)}`,
    }
  }

  return {
    valido: false,
    mensaje: `Discrepancia de monto: Factura $${montoFactura.toFixed(2)} vs Cotización $${montoCotizacion.toFixed(2)}`,
  }
}

/**
 * Calcula la fecha de vencimiento (fecha + 30 días)
 */
export function calcularDeadline(fechaEmision: string): string | null {
  try {
    const fecha = new Date(fechaEmision)
    if (isNaN(fecha.getTime())) return null

    fecha.setDate(fecha.getDate() + 30)
    return fecha.toISOString().split('T')[0]
  } catch {
    return null
  }
}
