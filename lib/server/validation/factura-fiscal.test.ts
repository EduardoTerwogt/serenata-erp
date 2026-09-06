import { describe, expect, it } from 'vitest'
import { validarFacturaFiscalProveedor } from './factura-fiscal'

describe('validarFacturaFiscalProveedor', () => {
  describe('persona moral', () => {
    it('valida cuando el desglose es exactamente subtotal + IVA 16%, sin retenciones', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 0, monto_total: 1160 },
        1000,
        'moral'
      )
      expect(result.estado_validacion).toBe('validado')
      expect(result.detalle_validacion).toBeNull()
    })

    it('trata null/undefined como moral por default', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 0, monto_total: 1160 },
        1000,
        null
      )
      expect(result.estado_validacion).toBe('validado')
    })

    it('marca revision si un proveedor moral trae retención de IVA', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160, iva_retenido: 106.67, isr_retenido: 0, monto_total: 1053.33 },
        1000,
        'moral'
      )
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('persona moral (sin retenciones)')
    })

    it('marca revision si falta el IVA trasladado esperado', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 0, iva_retenido: 0, isr_retenido: 0, monto_total: 1000 },
        1000,
        'moral'
      )
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('IVA trasladado no coincide')
    })
  })

  describe('persona física con honorarios', () => {
    it('valida cuando trae IVA 16% + retención IVA 2/3 + retención ISR 10%', () => {
      // Total = Subtotal + IVA trasladado - retenciones = 1000 + 160 - 106.67 - 100 = 953.33
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160, iva_retenido: 106.67, isr_retenido: 100, monto_total: 953.33 },
        1000,
        'fisica'
      )
      expect(result.estado_validacion).toBe('validado')
    })

    it('marca revision si le falta la retención de ISR', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160, iva_retenido: 106.67, isr_retenido: 0, monto_total: 1053.33 },
        1000,
        'fisica'
      )
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('Retención de ISR no coincide')
    })

    it('marca revision si le falta la retención de IVA', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 100, monto_total: 1060 },
        1000,
        'fisica'
      )
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('Retención de IVA no coincide')
    })

    it('detecta un subtotal que no corresponde al monto neto esperado', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 900, iva_trasladado: 144, iva_retenido: 96, isr_retenido: 90, monto_total: 858 },
        1000,
        'fisica'
      )
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('Subtotal no coincide')
    })
  })

  describe('casos generales', () => {
    it('marca revision si no se pudo leer el monto total', () => {
      const result = validarFacturaFiscalProveedor({}, 1000, 'moral')
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('monto total')
    })

    it('marca revision si no se pudo leer el subtotal', () => {
      const result = validarFacturaFiscalProveedor({ monto_total: 1160 }, 1000, 'moral')
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('subtotal')
    })

    it('marca revision si el Total del XML no cuadra con su propio desglose', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 0, monto_total: 1200 },
        1000,
        'moral'
      )
      expect(result.estado_validacion).toBe('revision')
      expect(result.detalle_validacion).toContain('no cuadra con su propio desglose')
    })

    it('tolera diferencias de centavos por redondeo', () => {
      const result = validarFacturaFiscalProveedor(
        { subtotal: 1000, iva_trasladado: 160.004, iva_retenido: 0, isr_retenido: 0, monto_total: 1160.004 },
        1000,
        'moral'
      )
      expect(result.estado_validacion).toBe('validado')
    })
  })
})
