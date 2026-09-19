import { describe, expect, it } from 'vitest'
import { validarFacturaParaProveedor } from '../factura-mensaje-proveedor'

describe('validarFacturaParaProveedor', () => {
  it('solo el subtotal mal -> muestra ambos montos e invita a contactar a Serenata', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 900, iva_trasladado: 144, iva_retenido: 0, isr_retenido: 0, monto_total: 1044 },
      1000,
      'moral'
    )
    expect(result.estado_validacion).toBe('revision')
    expect(result.mensaje_proveedor).toContain('$900.00')
    expect(result.mensaje_proveedor).toContain('$1000.00')
    expect(result.mensaje_proveedor).toContain('ponte en contacto con nosotros')
    expect(result.mostrar_ejemplo).toBe(false)
  })

  it('subtotal y desglose mal a la vez -> sigue siendo el mensaje de subtotal (manda sobre el resto)', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 900, iva_trasladado: 0, iva_retenido: 0, isr_retenido: 0, monto_total: 900 },
      1000,
      'moral'
    )
    expect(result.mensaje_proveedor).toContain('$900.00')
    expect(result.mensaje_proveedor).toContain('$1000.00')
    expect(result.mostrar_ejemplo).toBe(false)
  })

  it('subtotal correcto, IVA trasladado mal -> mensaje específico, con ejemplo (no es un problema de régimen)', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 1000, iva_trasladado: 0, iva_retenido: 0, isr_retenido: 0, monto_total: 1000 },
      1000,
      'moral'
    )
    expect(result.estado_validacion).toBe('revision')
    expect(result.mensaje_proveedor).toContain('IVA trasladado no coincide')
    expect(result.mostrar_ejemplo).toBe(true)
  })

  it('persona moral con retención de IVA que no debería llevar -> mensaje genérico de régimen fiscal', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 1000, iva_trasladado: 160, iva_retenido: 106.67, isr_retenido: 0, monto_total: 1053.33 },
      1000,
      'moral'
    )
    expect(result.mensaje_proveedor).toContain('Los impuestos aplicados no corresponden a tu régimen fiscal')
    expect(result.mensaje_proveedor).toContain('simulador de factura')
    expect(result.mensaje_proveedor).not.toContain('106.67')
    expect(result.mostrar_ejemplo).toBe(false)
  })

  it('persona moral con retención de ISR que no debería llevar -> mismo mensaje genérico de régimen fiscal', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 100, monto_total: 1060 },
      1000,
      'moral'
    )
    expect(result.mensaje_proveedor).toContain('Los impuestos aplicados no corresponden a tu régimen fiscal')
    expect(result.mostrar_ejemplo).toBe(false)
  })

  it('persona física con un monto de retención de IVA equivocado -> mismo mensaje genérico de régimen fiscal', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 100, monto_total: 1060 },
      1000,
      'fisica'
    )
    expect(result.mensaje_proveedor).toContain('Los impuestos aplicados no corresponden a tu régimen fiscal')
    expect(result.mostrar_ejemplo).toBe(false)
  })

  it('no se pudo leer el subtotal del XML -> mensaje específico sin montos, con ejemplo', () => {
    const result = validarFacturaParaProveedor({ monto_total: 1160 }, 1000, 'moral')
    expect(result.mensaje_proveedor).toContain('No se pudo leer el subtotal')
    expect(result.mostrar_ejemplo).toBe(true)
  })

  it('factura validada -> sin mensaje, sin ejemplo', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 1000, iva_trasladado: 160, iva_retenido: 0, isr_retenido: 0, monto_total: 1160 },
      1000,
      'moral'
    )
    expect(result.estado_validacion).toBe('validado')
    expect(result.mensaje_proveedor).toBeNull()
    expect(result.mostrar_ejemplo).toBe(false)
  })
})
