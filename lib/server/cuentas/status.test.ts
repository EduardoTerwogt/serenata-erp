import { describe, expect, it } from 'vitest'
import { calcularEstadoCuentaCobrarDetallado, calcularEstadoOrdenPago, calcularSaldoPendiente } from '@/lib/server/cuentas/status'

describe('cuentas/status', () => {
  it('calcula saldo pendiente sin negativos', () => {
    expect(calcularSaldoPendiente(100, 40)).toBe(60)
    expect(calcularSaldoPendiente(100, 100)).toBe(0)
    expect(calcularSaldoPendiente(100, 120)).toBe(0)
  })

  it('marca facturada sin pagos', () => {
    expect(calcularEstadoCuentaCobrarDetallado({
      montoPagado: 0,
      montoTotal: 100,
      isFacturada: true,
    })).toBe('FACTURADO')
  })

  it('marca vencida cuando hay saldo pendiente y fecha pasada', () => {
    expect(calcularEstadoCuentaCobrarDetallado({
      montoPagado: 20,
      montoTotal: 100,
      isFacturada: true,
      fechaVencimiento: '2026-01-01',
      today: new Date('2026-04-09T12:00:00Z'),
    })).toBe('VENCIDO')
  })

  it('calcula estado de orden de pago', () => {
    expect(calcularEstadoOrdenPago([
      { x_pagar: 100, monto_pagado: 0 },
      { x_pagar: 200, monto_pagado: 0 },
    ])).toBe('GENERADA')

    expect(calcularEstadoOrdenPago([
      { x_pagar: 100, monto_pagado: 100 },
      { x_pagar: 200, monto_pagado: 0 },
    ])).toBe('PARCIALMENTE_PAGADA')

    expect(calcularEstadoOrdenPago([
      { x_pagar: 100, monto_pagado: 100 },
      { x_pagar: 200, monto_pagado: 200 },
    ])).toBe('COMPLETADA')
  })
})
