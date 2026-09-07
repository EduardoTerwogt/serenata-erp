import { describe, it, expect } from 'vitest'
import {
  buildRulerLabels,
  computeBarSpan,
  computeRange,
  computeTodayPercent,
  daysBetween,
  percentForDate,
} from './gantt-helpers'

describe('daysBetween', () => {
  it('cuenta días entre dos fechas', () => {
    expect(daysBetween('2026-06-01', '2026-06-05')).toBe(4)
  })

  it('es negativo cuando b es anterior a a', () => {
    expect(daysBetween('2026-06-05', '2026-06-01')).toBe(-4)
  })

  it('es 0 para la misma fecha', () => {
    expect(daysBetween('2026-06-01', '2026-06-01')).toBe(0)
  })
})

describe('computeRange', () => {
  it('usa min/max de las fechas dadas con padding', () => {
    const range = computeRange(['2026-06-01', '2026-06-30'])
    expect(daysBetween(range.startISO, '2026-06-01')).toBeGreaterThanOrEqual(0)
    expect(daysBetween('2026-06-30', range.endISO)).toBeGreaterThanOrEqual(0)
  })

  it('genera un rango mínimo cuando solo hay una fecha', () => {
    const range = computeRange(['2026-06-15'])
    expect(daysBetween(range.startISO, range.endISO)).toBeGreaterThanOrEqual(6)
  })

  it('genera un rango alrededor de hoy cuando no hay fechas', () => {
    const range = computeRange([])
    const hoy = new Date().toISOString().slice(0, 10)
    expect(daysBetween(range.startISO, hoy)).toBeGreaterThanOrEqual(0)
    expect(daysBetween(hoy, range.endISO)).toBeGreaterThanOrEqual(0)
  })

  it('ignora fechas vacías/falsy', () => {
    const range = computeRange(['2026-06-01', '', '2026-06-10'])
    expect(range.startISO).toBeTruthy()
  })
})

describe('percentForDate', () => {
  it('retorna 0 en el inicio del rango y 100 en el fin', () => {
    const range = { startISO: '2026-06-01', endISO: '2026-06-11' }
    expect(percentForDate('2026-06-01', range)).toBe(0)
    expect(percentForDate('2026-06-11', range)).toBe(100)
  })

  it('retorna 50 en el punto medio', () => {
    const range = { startISO: '2026-06-01', endISO: '2026-06-11' }
    expect(percentForDate('2026-06-06', range)).toBe(50)
  })

  it('clampa fechas fuera del rango', () => {
    const range = { startISO: '2026-06-01', endISO: '2026-06-11' }
    expect(percentForDate('2026-05-01', range)).toBe(0)
    expect(percentForDate('2026-07-01', range)).toBe(100)
  })
})

describe('computeBarSpan', () => {
  const range = { startISO: '2026-06-01', endISO: '2026-06-11' }

  it('usa inicio-fin cuando ambos existen y el inicio es anterior', () => {
    const span = computeBarSpan('2026-06-01', '2026-06-06', range)
    expect(span.leftPct).toBe(0)
    expect(span.widthPct).toBe(50)
  })

  it('usa un marcador de ancho fijo cuando no hay fecha de inicio', () => {
    const span = computeBarSpan(null, '2026-06-06', range, 10)
    expect(span.leftPct).toBeCloseTo(40, 5)
    expect(span.widthPct).toBeCloseTo(10, 5)
  })

  it('usa el marcador de ancho fijo cuando el inicio es posterior al fin (dato inconsistente)', () => {
    const span = computeBarSpan('2026-06-10', '2026-06-06', range, 10)
    expect(span.widthPct).toBeGreaterThan(0)
  })
})

describe('computeTodayPercent', () => {
  const range = { startISO: '2026-06-01', endISO: '2026-06-11' }

  it('retorna el porcentaje cuando hoy está dentro del rango', () => {
    expect(computeTodayPercent(range, '2026-06-06')).toBe(50)
  })

  it('retorna null cuando hoy está antes del rango', () => {
    expect(computeTodayPercent(range, '2026-05-01')).toBeNull()
  })

  it('retorna null cuando hoy está después del rango', () => {
    expect(computeTodayPercent(range, '2026-07-01')).toBeNull()
  })

  it('retorna 0/100 en los bordes exactos del rango', () => {
    expect(computeTodayPercent(range, '2026-06-01')).toBe(0)
    expect(computeTodayPercent(range, '2026-06-11')).toBe(100)
  })
})

describe('buildRulerLabels', () => {
  it('genera etiquetas que suman 100% de ancho', () => {
    const range = { startISO: '2026-06-01', endISO: '2026-06-30' }
    const labels = buildRulerLabels(range)
    const total = labels.reduce((sum, l) => sum + l.widthPct, 0)
    expect(total).toBeCloseTo(100, 5)
  })

  it('no genera más etiquetas que maxLabels', () => {
    const range = { startISO: '2026-06-01', endISO: '2026-12-31' }
    const labels = buildRulerLabels(range, 4)
    expect(labels.length).toBeLessThanOrEqual(4)
  })

  it('genera una sola etiqueta cuando el rango es de un día', () => {
    const range = { startISO: '2026-06-01', endISO: '2026-06-01' }
    const labels = buildRulerLabels(range)
    expect(labels).toHaveLength(1)
    expect(labels[0].widthPct).toBe(100)
  })
})
