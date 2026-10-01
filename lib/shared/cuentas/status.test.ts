import { describe, expect, it } from 'vitest'
import { calcularSaldoPendiente } from '@/lib/shared/cuentas/status'

describe('cuentas/status', () => {
  it('calcula saldo pendiente sin negativos', () => {
    expect(calcularSaldoPendiente(100, 40)).toBe(60)
    expect(calcularSaldoPendiente(100, 100)).toBe(0)
    expect(calcularSaldoPendiente(100, 120)).toBe(0)
  })

  // EF-3 3B-1: calcularSaldoPendiente ahora redondea con round2 (decimal-safe)
  // en vez de Number(saldo.toFixed(2)) -- toFixed(2) de 100.005 da "100.00" en
  // JS por el error de representación de punto flotante, mientras
  // ROUND(100.005, 2) de Postgres (la política canónica) da 100.01. Confirmado
  // real contra serenata-erp-test: SELECT ROUND(100.005::numeric, 2) = 100.01.
  it('redondea con paridad decimal-segura contra Postgres, incluido el caso límite .xx5', () => {
    expect(Number((100.005).toFixed(2))).toBe(100) // documenta el bug que motivó el fix
    expect(calcularSaldoPendiente(100.005, 0)).toBe(100.01)
  })
})
