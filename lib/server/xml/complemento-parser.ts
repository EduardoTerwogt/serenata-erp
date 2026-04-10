export interface ComplementoPagoData {
  uuid?: string
  fecha_pago?: string
  monto_total_pagos?: number
  moneda?: string
  error?: string
}

export function parseComplementoPagoXML(xmlContent: string): ComplementoPagoData {
  try {
    const esComplemento = /Pago20:Pagos|pago20:Pagos|pago10:Pagos|Pago10:Pagos/.test(xmlContent)
    if (!esComplemento) {
      return { error: 'El XML no parece ser un complemento de pago CFDI' }
    }

    const uuidMatch = xmlContent.match(/UUID\s*=\s*["']([^"']+)["']/i)
    const fechaPagoMatch = xmlContent.match(/FechaPago\s*=\s*["']([^"']+)["']/i)
    const montoMatch = xmlContent.match(/MontoTotalPagos\s*=\s*["']([^"']+)["']/i)
    const monedaMatch = xmlContent.match(/MonedaP\s*=\s*["']([^"']+)["']/i)

    return {
      uuid: uuidMatch?.[1],
      fecha_pago: fechaPagoMatch?.[1]?.split('T')?.[0],
      monto_total_pagos: montoMatch ? parseFloat(montoMatch[1]) : undefined,
      moneda: monedaMatch?.[1],
    }
  } catch (error) {
    return {
      error: `Error parseando complemento XML: ${error instanceof Error ? error.message : 'desconocido'}`
    }
  }
}
