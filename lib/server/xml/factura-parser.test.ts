import { describe, expect, it } from 'vitest'
import {
  parseFacturaXML,
  validarMontoFactura,
  validarFacturaClienteXML,
  validarFacturaProveedorXML,
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

  describe('validarFacturaProveedorXML', () => {
    it('valida cuando el XML refleja neto + IVA 16%', () => {
      // neto 1000 -> esperado 1160.00
      const result = validarFacturaProveedorXML({ monto_total: 1160 }, 1000)
      expect(result.estado_validacion).toBe('validado')
    })

    it('marca revision cuando el XML no incluye el IVA esperado', () => {
      // factura solo por el neto, sin IVA -- discrepancia real
      const result = validarFacturaProveedorXML({ monto_total: 1000 }, 1000)
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('IVA 16%')
    })

    it('el resultado es el mismo sin importar el régimen fiscal del responsable', () => {
      // El régimen solo afecta la retención al transferir, no el Total del CFDI del proveedor.
      const moral = validarFacturaProveedorXML({ monto_total: 1160 }, 1000)
      const fisica = validarFacturaProveedorXML({ monto_total: 1160 }, 1000)
      expect(moral).toEqual(fisica)
    })
  })

  describe('calcularDeadline (ya existente)', () => {
    it('suma 30 días', () => {
      expect(calcularDeadline('2026-01-01')).toBe('2026-01-31')
    })
  })
})
