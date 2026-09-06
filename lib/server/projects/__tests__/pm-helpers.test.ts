import { describe, it, expect } from 'vitest'
import {
  agruparHitosPorSemana,
  calcularFechaLimite,
  esEstadoLegadoValido,
  estadoLegadoParaEtapa,
  ordenarRutaCritica,
} from '../pm-helpers'
import type { ProyectoTarea } from '@/lib/types'

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
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

// ==================== estadoLegadoParaEtapa ====================

describe('estadoLegadoParaEtapa', () => {
  it('mapea las 4 etapas de Grabación a su estado legado', () => {
    expect(estadoLegadoParaEtapa('Preproducción')).toBe('PREPRODUCCION')
    expect(estadoLegadoParaEtapa('Rodaje')).toBe('RODAJE')
    expect(estadoLegadoParaEtapa('Postproducción')).toBe('POSTPRODUCCION')
    expect(estadoLegadoParaEtapa('Finalizado')).toBe('FINALIZADO')
  })

  it('retorna null para etapas sin equivalente legado (Concierto, Diseño de Show)', () => {
    expect(estadoLegadoParaEtapa('Montaje')).toBeNull()
    expect(estadoLegadoParaEtapa('Show')).toBeNull()
    expect(estadoLegadoParaEtapa('Cierre')).toBeNull()
    expect(estadoLegadoParaEtapa('Brief')).toBeNull()
  })
})

describe('esEstadoLegadoValido', () => {
  it('acepta los 4 valores del enum legado', () => {
    expect(esEstadoLegadoValido('PREPRODUCCION')).toBe(true)
    expect(esEstadoLegadoValido('FINALIZADO')).toBe(true)
  })

  it('rechaza cualquier otro texto', () => {
    expect(esEstadoLegadoValido('Show')).toBe(false)
    expect(esEstadoLegadoValido('')).toBe(false)
  })
})

// ==================== calcularFechaLimite ====================

describe('calcularFechaLimite', () => {
  it('resta los días antes de entrega a la fecha de entrega', () => {
    expect(calcularFechaLimite('2026-06-15', 5)).toBe('2026-06-10')
  })

  it('cruza límites de mes correctamente', () => {
    expect(calcularFechaLimite('2026-03-02', 5)).toBe('2026-02-25')
  })

  it('retorna null si falta fecha_entrega', () => {
    expect(calcularFechaLimite(null, 5)).toBeNull()
    expect(calcularFechaLimite(undefined, 5)).toBeNull()
  })

  it('retorna null si falta dias_antes_entrega', () => {
    expect(calcularFechaLimite('2026-06-15', null)).toBeNull()
    expect(calcularFechaLimite('2026-06-15', undefined)).toBeNull()
  })

  it('acepta 0 días antes de entrega (misma fecha)', () => {
    expect(calcularFechaLimite('2026-06-15', 0)).toBe('2026-06-15')
  })

  it('retorna null si fecha_entrega no es una fecha válida', () => {
    expect(calcularFechaLimite('no-es-fecha', 5)).toBeNull()
  })
})

// ==================== ordenarRutaCritica ====================

describe('ordenarRutaCritica', () => {
  it('filtra solo tareas con es_hito=true', () => {
    const tareas = [
      baseTarea({ id: 'a', es_hito: false }),
      baseTarea({ id: 'b', es_hito: true, fecha_limite: '2026-05-01' }),
    ]
    const resultado = ordenarRutaCritica(tareas)
    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe('b')
  })

  it('ordena por fecha_limite ascendente', () => {
    const tareas = [
      baseTarea({ id: 'tarde', es_hito: true, fecha_limite: '2026-06-01' }),
      baseTarea({ id: 'temprano', es_hito: true, fecha_limite: '2026-01-01' }),
    ]
    const resultado = ordenarRutaCritica(tareas)
    expect(resultado.map((t) => t.id)).toEqual(['temprano', 'tarde'])
  })

  it('deja las tareas sin fecha_limite al final', () => {
    const tareas = [
      baseTarea({ id: 'sin-fecha', es_hito: true, fecha_limite: null }),
      baseTarea({ id: 'con-fecha', es_hito: true, fecha_limite: '2026-01-01' }),
    ]
    const resultado = ordenarRutaCritica(tareas)
    expect(resultado.map((t) => t.id)).toEqual(['con-fecha', 'sin-fecha'])
  })

  it('no muta el arreglo original', () => {
    const tareas = [baseTarea({ id: 'a', es_hito: true, fecha_limite: '2026-01-01' })]
    const copia = [...tareas]
    ordenarRutaCritica(tareas)
    expect(tareas).toEqual(copia)
  })
})

// ==================== agruparHitosPorSemana ====================

describe('agruparHitosPorSemana', () => {
  it('agrupa hitos de la misma semana ISO bajo el mismo lunes', () => {
    const tareas = [
      baseTarea({ id: 'lunes', es_hito: true, fecha_limite: '2026-06-01' }), // lunes
      baseTarea({ id: 'miercoles', es_hito: true, fecha_limite: '2026-06-03' }), // miércoles misma semana
    ]
    const semanas = agruparHitosPorSemana(tareas)
    expect(semanas).toHaveLength(1)
    expect(semanas[0].semana_inicio).toBe('2026-06-01')
    expect(semanas[0].hitos.map((h) => h.id).sort()).toEqual(['lunes', 'miercoles'])
  })

  it('separa hitos de semanas distintas y ordena las semanas cronológicamente', () => {
    const tareas = [
      baseTarea({ id: 'semana2', es_hito: true, fecha_limite: '2026-06-10' }),
      baseTarea({ id: 'semana1', es_hito: true, fecha_limite: '2026-06-01' }),
    ]
    const semanas = agruparHitosPorSemana(tareas)
    expect(semanas.map((s) => s.semana_inicio)).toEqual(['2026-06-01', '2026-06-08'])
  })

  it('excluye hitos sin fecha_limite', () => {
    const tareas = [baseTarea({ id: 'sin-fecha', es_hito: true, fecha_limite: null })]
    expect(agruparHitosPorSemana(tareas)).toEqual([])
  })

  it('un domingo pertenece a la semana que empieza el lunes anterior', () => {
    const tareas = [baseTarea({ id: 'domingo', es_hito: true, fecha_limite: '2026-06-07' })]
    const semanas = agruparHitosPorSemana(tareas)
    expect(semanas[0].semana_inicio).toBe('2026-06-01')
  })
})
