import { describe, expect, it } from 'vitest'
import { parseComplementoPagoXML, relacionadosDeComplemento } from '@/lib/server/xml/complemento-parser'

const xml = (pagos: string) => `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital">
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">${pagos}</pago20:Pagos>
    <tfd:TimbreFiscalDigital UUID="CCCCCCCC-0000-0000-0000-000000000001"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`

describe('relacionadosDeComplemento (P9)', () => {
  it('una entrada por DoctoRelacionado con su ImpPagado, de todos los Pago', () => {
    const data = parseComplementoPagoXML(xml(`
      <pago20:Pago FechaPago="2026-10-10T12:00:00" MonedaP="MXN" Monto="300.00">
        <pago20:DoctoRelacionado IdDocumento="AAAAAAAA-0000-0000-0000-000000000001" ImpPagado="200.00"/>
        <pago20:DoctoRelacionado IdDocumento="BBBBBBBB-0000-0000-0000-000000000002" ImpPagado="100.00"/>
      </pago20:Pago>
      <pago20:Pago FechaPago="2026-10-20T12:00:00" MonedaP="MXN" Monto="50.00">
        <pago20:DoctoRelacionado IdDocumento="AAAAAAAA-0000-0000-0000-000000000001" ImpPagado="50.00"/>
      </pago20:Pago>`))
    expect(relacionadosDeComplemento(data)).toEqual([
      { uuid_factura: 'AAAAAAAA-0000-0000-0000-000000000001', monto_pagado: 200 },
      { uuid_factura: 'BBBBBBBB-0000-0000-0000-000000000002', monto_pagado: 100 },
      { uuid_factura: 'AAAAAAAA-0000-0000-0000-000000000001', monto_pagado: 50 },
    ])
  })

  it('omite los documentos sin ImpPagado y un XML que no es complemento no relaciona nada', () => {
    const data = parseComplementoPagoXML(xml(`<pago20:Pago FechaPago="2026-10-10T12:00:00" Monto="1"><pago20:DoctoRelacionado IdDocumento="AAAAAAAA-0000-0000-0000-000000000001"/></pago20:Pago>`))
    expect(relacionadosDeComplemento(data)).toEqual([])
    expect(relacionadosDeComplemento(parseComplementoPagoXML('<xml />'))).toEqual([])
  })
})
