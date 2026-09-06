import { describe, expect, it } from 'vitest'
import {
  parseFacturaXML,
  validarMontoFactura,
  validarFacturaClienteXML,
  calcularDeadline,
} from '@/lib/server/xml/factura-parser'

const CFDI_BASICO = `
  <cfdi:Comprobante Folio="A123" Fecha="2026-04-09T10:00:00" SubTotal="1000.00" Total="1160.00">
    <cfdi:Emisor Rfc="SER010101AAA" Nombre="Serenata House" />
    <cfdi:Receptor Rfc="XAXX010101000" Nombre="Cliente de prueba" />
    <cfdi:Complemento>
      <tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555" />
    </cfdi:Complemento>
  </cfdi:Comprobante>
`

const CFDI_PERSONA_MORAL = `
  <cfdi:Comprobante Folio="M1" Fecha="2026-04-09T10:00:00" SubTotal="1000.00" Total="1160.00">
    <cfdi:Emisor Rfc="MOR010101AAA" Nombre="Proveedor Moral SA de CV" />
    <cfdi:Receptor Rfc="SER010101AAA" Nombre="Serenata House" />
    <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
      <cfdi:Traslados>
        <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
  </cfdi:Comprobante>
`

const CFDI_PERSONA_FISICA = `
  <cfdi:Comprobante Folio="F1" Fecha="2026-04-09T10:00:00" SubTotal="1000.00" Total="1053.33">
    <cfdi:Emisor Rfc="FIS010101AAA" Nombre="Proveedor Persona Física" />
    <cfdi:Receptor Rfc="SER010101AAA" Nombre="Serenata House" />
    <cfdi:Impuestos TotalImpuestosTrasladados="160.00" TotalImpuestosRetenidos="106.67">
      <cfdi:Retenciones>
        <cfdi:Retencion Impuesto="002" Importe="106.67" />
        <cfdi:Retencion Impuesto="001" Importe="100.00" />
      </cfdi:Retenciones>
      <cfdi:Traslados>
        <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="160.00" />
      </cfdi:Traslados>
    </cfdi:Impuestos>
  </cfdi:Comprobante>
`

describe('xml/factura-parser', () => {
  it('parsea folio, fecha, monto, RFCs y UUID de un CFDI básico', () => {
    const result = parseFacturaXML(CFDI_BASICO)
    expect(result.error).toBeUndefined()
    expect(result.folio).toBe('A123')
    expect(result.fecha_emision).toBe('2026-04-09')
    expect(result.monto_total).toBe(1160)
    expect(result.rfc_emisor).toBe('SER010101AAA')
    expect(result.rfc_receptor).toBe('XAXX010101000')
    expect(result.uuid_timbrado).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('no confunde SubTotal con Total', () => {
    const result = parseFacturaXML(CFDI_BASICO)
    expect(result.monto_total).not.toBe(1000)
  })

  it('reporta error si faltan folio o fecha', () => {
    const result = parseFacturaXML('<cfdi:Comprobante Total="100.00" />')
    expect(result.error).toBeTruthy()
  })

  describe('validarMontoFactura (informativa, ya existente)', () => {
    it('detecta coincidencia dentro de tolerancia', () => {
      expect(validarMontoFactura(1000, 1000.005).coincide).toBe(true)
    })
    it('detecta discrepancia', () => {
      expect(validarMontoFactura(1000, 900).coincide).toBe(false)
    })
  })

  describe('validarFacturaClienteXML', () => {
    it('valida cuando el monto coincide con la cuenta', () => {
      const result = validarFacturaClienteXML({ monto_total: 1160 }, 1160)
      expect(result.estado_validacion).toBe('validado')
      expect(result.detalle_validacion).toBeNull()
    })

    it('tolera diferencias de centavos por redondeo', () => {
      const result = validarFacturaClienteXML({ monto_total: 1160.004 }, 1160)
      expect(result.estado_validacion).toBe('validado')
    })

    it('marca revision cuando el monto no coincide', () => {
      const result = validarFacturaClienteXML({ monto_total: 900 }, 1160)
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('900.00')
      expect(result.detalle_validacion).toContain('1160.00')
    })

    it('marca revision si no se pudo leer el monto', () => {
      const result = validarFacturaClienteXML({}, 1160)
      expect(result.estado_validacion).toBe('revision')
    })
  })

  describe('parseFacturaXML - desglose fiscal (traslados/retenciones)', () => {
    it('extrae subtotal e IVA trasladado de un CFDI de persona moral (sin retenciones)', () => {
      const result = parseFacturaXML(CFDI_PERSONA_MORAL)
      expect(result.subtotal).toBe(1000)
      expect(result.iva_trasladado).toBe(160)
      expect(result.iva_retenido).toBe(0)
      expect(result.isr_retenido).toBe(0)
    })

    it('extrae IVA trasladado y ambas retenciones de un CFDI de persona física', () => {
      const result = parseFacturaXML(CFDI_PERSONA_FISICA)
      expect(result.subtotal).toBe(1000)
      expect(result.iva_trasladado).toBe(160)
      expect(result.iva_retenido).toBe(106.67)
      expect(result.isr_retenido).toBe(100)
    })
  })

  describe('calcularDeadline (ya existente)', () => {
    it('suma 30 días', () => {
      expect(calcularDeadline('2026-01-01')).toBe('2026-01-31')
    })
  })
})
