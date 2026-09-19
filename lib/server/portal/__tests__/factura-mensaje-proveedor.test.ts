import { describe, expect, it } from 'vitest'
import { validarFacturaParaProveedor } from '../factura-mensaje-proveedor'

const MENSAJE_GENERICO = /no corresponde a lo esperado/

describe('validarFacturaParaProveedor', () => {
  it('solo el subtotal mal -> mensaje genérico, sin ejemplo', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 900, iva_trasladado: 144, iva_retenido: 0, isr_retenido: 0, monto_total: 1044 },
      1000,
      'moral'
    )
    expect(result.estado_validacion).toBe('revision')
    expect(result.mensaje_proveedor).toMatch(MENSAJE_GENERICO)
    expect(result.mensaje_proveedor).not.toContain('900')
    expect(result.mensaje_proveedor).not.toContain('1000')
    expect(result.mostrar_ejemplo).toBe(false)
  })

  it('subtotal correcto, desglose mal -> mensaje específico, con ejemplo', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 1000, iva_trasladado: 0, iva_retenido: 0, isr_retenido: 0, monto_total: 1000 },
      1000,
      'moral'
    )
    expect(result.estado_validacion).toBe('revision')
    expect(result.mensaje_proveedor).toContain('IVA trasladado no coincide')
    expect(result.mostrar_ejemplo).toBe(true)
  })

  it('subtotal y desglose mal a la vez -> sigue siendo genérico (subtotal manda)', () => {
    const result = validarFacturaParaProveedor(
      { subtotal: 900, iva_trasladado: 0, iva_retenido: 0, isr_retenido: 0, monto_total: 900 },
      1000,
      'moral'
    )
    expect(result.mensaje_proveedor).toMatch(MENSAJE_GENERICO)
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
