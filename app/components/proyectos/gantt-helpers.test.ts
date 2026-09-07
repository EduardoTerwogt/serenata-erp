import { describe, it, expect } from 'vitest'
import {
  buildGanttRowsFromProyectos,
  buildGanttRowsFromTareas,
  buildRulerLabels,
  computeBarSpan,
  computeRange,
  computeTodayPercent,
  daysBetween,
  percentForDate,
} from './gantt-helpers'
import type { Proyecto, ProyectoTarea, TipoProyectoConEtapas } from '@/lib/types'

const baseProyecto = (overrides: Partial<Proyecto> = {}): Proyecto => ({
  id: overrides.id ?? 'SH001',
  cliente: 'Cliente',
  proyecto: 'Proyecto',
  fecha_entrega: null,
  locacion: null,
  horarios: null,
  punto_encuentro: null,
  estado: 'PREPRODUCCION',
  notas: null,
  created_at: '2026-01-01T00:00:00.000Z',
  tipo_proyecto_id: null,
  etapa_id: null,
  fecha_inicio_real: null,
  fecha_cierre_real: null,
  ...overrides,
})

const baseTarea = (overrides: Partial<ProyectoTarea> = {}): ProyectoTarea => ({
  id: overrides.id ?? 'tarea-1',
  proyecto_id: 'SH001',
  titulo: 'Tarea',
  descripcion: null,
  estado: 'PENDIENTE',
  asignado_a: null,
  es_hito: false,
  origen: 'manual',
  fecha_limite: null,
  fecha_completada: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  ...overrides,
})

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

describe('buildGanttRowsFromTareas', () => {
  it('omite tareas sin fecha_limite', () => {
    const tareas = [
      baseTarea({ id: 'sin-fecha', fecha_limite: null }),
      baseTarea({ id: 'con-fecha', fecha_limite: '2026-06-10' }),
    ]
    const { rows } = buildGanttRowsFromTareas(tareas)
    expect(rows.map((r) => r.id)).toEqual(['con-fecha'])
  })

  it('retorna vacío (sin rango) cuando ninguna tarea tiene fecha_limite', () => {
    const resultado = buildGanttRowsFromTareas([baseTarea({ fecha_limite: null })])
    expect(resultado.rows).toEqual([])
    expect(resultado.rulerLabels).toEqual([])
    expect(resultado.todayPct).toBeNull()
  })

  it('mapea el tono desde el estado de la tarea', () => {
    const tareas = [baseTarea({ id: 'completada', estado: 'COMPLETADA', fecha_limite: '2026-06-10' })]
    const { rows } = buildGanttRowsFromTareas(tareas)
    expect(rows[0].bars[0].tone).toBe('approved')
  })

  it('agrega hitoPct/hitoTone solo para tareas marcadas es_hito', () => {
    const tareas = [
      baseTarea({ id: 'hito', es_hito: true, fecha_limite: '2026-06-10' }),
      baseTarea({ id: 'normal', es_hito: false, fecha_limite: '2026-06-10' }),
    ]
    const { rows } = buildGanttRowsFromTareas(tareas)
    const hito = rows.find((r) => r.id === 'hito')!
    const normal = rows.find((r) => r.id === 'normal')!
    expect(hito.hitoPct).toBeDefined()
    expect(normal.hitoPct).toBeUndefined()
  })

  it('usa created_at como inicio de la barra cuando es anterior a fecha_limite (barra ancha, no el marcador de ancho fijo)', () => {
    const tareas = [baseTarea({ created_at: '2026-06-01T00:00:00.000Z', fecha_limite: '2026-06-11' })]
    const { rows } = buildGanttRowsFromTareas(tareas)
    // El marcador de ancho fijo (sin fecha de inicio válida) sería ~8% --
    // un span real de 10 días sobre un rango con poco padding es mucho más ancho.
    expect(rows[0].bars[0].widthPct).toBeGreaterThan(50)
  })
})

describe('buildGanttRowsFromProyectos', () => {
  const tipos: TipoProyectoConEtapas[] = [
    {
      id: 't1', nombre: 'Grabación', activo: true, created_at: '',
      etapas: [
        { id: 'e1', tipo_proyecto_id: 't1', nombre: 'Preproducción', orden: 1, es_etapa_final: false, created_at: '' },
        { id: 'e2', tipo_proyecto_id: 't1', nombre: 'Finalizado', orden: 2, es_etapa_final: true, created_at: '' },
      ],
    },
  ]

  it('omite proyectos sin fecha_entrega ni fecha_cierre_real, y los cuenta en omitidos', () => {
    const proyectos = [
      baseProyecto({ id: 'sin-fecha' }),
      baseProyecto({ id: 'con-fecha', fecha_entrega: '2026-06-15' }),
    ]
    const { rows, omitidos } = buildGanttRowsFromProyectos(proyectos, tipos)
    expect(rows.map((r) => r.id)).toEqual(['con-fecha'])
    expect(omitidos).toBe(1)
  })

  it('usa fecha_cierre_real como fin cuando no hay fecha_entrega', () => {
    const proyectos = [baseProyecto({ fecha_entrega: null, fecha_cierre_real: '2026-06-15' })]
    const { rows } = buildGanttRowsFromProyectos(proyectos, tipos)
    expect(rows).toHaveLength(1)
  })

  it('usa el tono de la etapa resuelta cuando el proyecto tiene tipo/etapa asignados', () => {
    const proyectos = [baseProyecto({ tipo_proyecto_id: 't1', etapa_id: 'e2', fecha_entrega: '2026-06-15' })]
    const { rows } = buildGanttRowsFromProyectos(proyectos, tipos)
    expect(rows[0].bars[0].tone).toBe('approved')
  })

  it('usa tono draft por default cuando el proyecto no tiene etapa resuelta', () => {
    const proyectos = [baseProyecto({ fecha_entrega: '2026-06-15' })]
    const { rows } = buildGanttRowsFromProyectos(proyectos, tipos)
    expect(rows[0].bars[0].tone).toBe('draft')
  })

  it('retorna vacío con omitidos=0 cuando la lista de proyectos está vacía', () => {
    const resultado = buildGanttRowsFromProyectos([], tipos)
    expect(resultado).toEqual({ rows: [], rulerLabels: [], todayPct: null, omitidos: 0 })
  })
})
