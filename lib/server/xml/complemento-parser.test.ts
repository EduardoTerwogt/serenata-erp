import { describe, expect, it } from 'vitest'
import { parseComplementoPagoXML } from '@/lib/server/xml/complemento-parser'

const UUID_FACTURA = 'aaaaaaaa-1111-2222-3333-444444444444'

const PAGOS20 = `
  <cfdi:Comprobante TipoDeComprobante="P" Fecha="2026-09-12T10:00:00">
    <cfdi:Complemento>
      <pago20:Pagos Version="2.0">
        <pago20:Totales MontoTotalPagos="1500.00" />
        <pago20:Pago FechaPago="2026-09-10T12:00:00" MonedaP="MXN" Monto="1500.00">
          <pago20:DoctoRelacionado IdDocumento="${UUID_FACTURA.toUpperCase()}" ImpPagado="1000.00" />
          <pago20:DoctoRelacionado IdDocumento="bbbbbbbb-1111-2222-3333-444444444444" ImpPagado="500.00" />
        </pago20:Pago>
      </pago20:Pagos>
      <tfd:TimbreFiscalDigital UUID="CCCCCCCC-0000-0000-0000-000000000000" />
    </cfdi:Complemento>
  </cfdi:Comprobante>
`

describe('xml/complemento-parser', () => {
  it('parsea un complemento básico (compatibilidad con la versión anterior)', () => {
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

  it('H5: lee cada Pago con sus DoctoRelacionado (IdDocumento e ImpPagado), y MontoTotalPagos de Totales', () => {
    const result = parseComplementoPagoXML(PAGOS20)
    expect(result.monto_total_pagos).toBe(1500)
    expect(result.pagos).toHaveLength(1)
    expect(result.pagos[0].doctos).toEqual([
      { id_documento: UUID_FACTURA.toUpperCase(), imp_pagado: 1000 },
      { id_documento: 'bbbbbbbb-1111-2222-3333-444444444444', imp_pagado: 500 },
    ])
  })
})
