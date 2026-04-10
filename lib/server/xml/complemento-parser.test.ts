import { describe, expect, it } from 'vitest'
import { parseComplementoPagoXML } from '@/lib/server/xml/complemento-parser'

describe('xml/complemento-parser', () => {
  it('parsea un complemento básico', () => {
    const xml = `
      <cfdi:Comprobante>
        <cfdi:Complemento>
          <pago20:Pagos MontoTotalPagos="1500.00">
            <pago20:Pago FechaPago="2026-04-09T10:00:00" MonedaP="MXN" />
          </pago20:Pagos>
          <tfd:TimbreFiscalDigital UUID="ABC-123" />
        </cfdi:Complemento>
      </cfdi:Comprobante>
    `

    const result = parseComplementoPagoXML(xml)
    expect(result.error).toBeUndefined()
    expect(result.uuid).toBe('ABC-123')
    expect(result.fecha_pago).toBe('2026-04-09')
    expect(result.monto_total_pagos).toBe(1500)
    expect(result.moneda).toBe('MXN')
  })

  it('detecta xml inválido', () => {
    const result = parseComplementoPagoXML('<xml />')
    expect(result.error).toBeTruthy()
  })
}
