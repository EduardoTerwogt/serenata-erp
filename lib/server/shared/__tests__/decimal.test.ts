import { describe, expect, it } from 'vitest'
import { round2 } from '@/lib/server/shared/decimal'

describe('round2', () => {
  it('redondea casos simples igual que toFixed', () => {
    expect(round2(100)).toBe(100)
    expect(round2(100.1)).toBe(100.1)
    expect(round2(100.126)).toBe(100.13)
    expect(round2(100.124)).toBe(100.12)
  })

  // Caso límite real que motiva este bloque (EF-3 3B-1): confirmado contra
  // serenata-erp-test que ROUND(100.005::numeric, 2) = 100.01 -- Postgres es
  // la política canónica de redondeo.
  it('coincide con ROUND(numeric,2) de Postgres en el caso límite .xx5 (100.005 -> 100.01)', () => {
    expect(round2(100.005)).toBe(100.01)
  })

  it('coincide con Postgres en el caso límite .xx5 con signo negativo', () => {
    expect(round2(-100.005)).toBe(-100.01)
  })

  it('mira solo el 3er decimal, sin acumular error de los siguientes (100.0051 -> 100.01)', () => {
    expect(round2(100.0051)).toBe(100.01)
    expect(round2(100.0049)).toBe(100.0)
  })

  it('un saldo pendiente tras un pago mayor al total (negativo) redondea con el mismo criterio', () => {
    expect(round2(-0.005)).toBe(-0.01)
  })
})
