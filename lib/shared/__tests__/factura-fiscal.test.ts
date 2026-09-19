import { describe, expect, it } from 'vitest'
import { calcularEjemploFactura } from '../factura-fiscal'

describe('calcularEjemploFactura', () => {
  it('persona moral: solo IVA trasladado, sin retenciones', () => {
    const ejemplo = calcularEjemploFactura(1000, 'moral')
    expect(ejemplo).toEqual({
      subtotal: 1000,
      iva_trasladado: 160,
      iva_retenido: 0,
      isr_retenido: 0,
      total: 1160,
      explicacion: expect.stringContaining('persona moral'),
    })
  })

  it('persona física con honorarios: IVA trasladado + retención IVA 2/3 + retención ISR 10%', () => {
    const ejemplo = calcularEjemploFactura(1000, 'fisica')
    expect(ejemplo.subtotal).toBe(1000)
    expect(ejemplo.iva_trasladado).toBe(160)
    expect(ejemplo.iva_retenido).toBeCloseTo(106.67, 2)
    expect(ejemplo.isr_retenido).toBe(100)
    expect(ejemplo.total).toBeCloseTo(1000 + 160 - 106.67 - 100, 2)
    expect(ejemplo.explicacion).toContain('persona física')
  })

  it('null/undefined regimen_fiscal se trata como moral (mismo default que el resto del negocio)', () => {
    const ejemplo = calcularEjemploFactura(1000, null)
    expect(ejemplo.iva_retenido).toBe(0)
    expect(ejemplo.isr_retenido).toBe(0)
  })
})
