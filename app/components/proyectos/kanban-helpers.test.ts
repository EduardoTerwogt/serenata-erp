import { describe, it, expect } from 'vitest'
import { groupProyectosByEtapa, groupTareasByEstado, isTareaOverdue, proyectosSinTipo, resolverEtapaProyecto } from './kanban-helpers'
import type { Proyecto, ProyectoTarea, TipoProyectoConEtapas, TipoProyectoEtapa } from '@/lib/types'

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
  ...overrides,
})

describe('groupTareasByEstado', () => {
  it('agrupa tareas en las 4 llaves de estado, incluso si están vacías', () => {
    const grupos = groupTareasByEstado([baseTarea({ id: 'a', estado: 'PENDIENTE' })])
    expect(grupos.PENDIENTE).toHaveLength(1)
    expect(grupos.EN_PROGRESO).toHaveLength(0)
    expect(grupos.COMPLETADA).toHaveLength(0)
    expect(grupos.BLOQUEADA).toHaveLength(0)
  })
})

describe('isTareaOverdue', () => {
  it('es true cuando fecha_limite es anterior a hoy y no está completada', () => {
    expect(isTareaOverdue({ fecha_limite: '2026-01-01', estado: 'PENDIENTE' }, '2026-06-01')).toBe(true)
  })

  it('es false cuando la tarea está completada, sin importar la fecha', () => {
    expect(isTareaOverdue({ fecha_limite: '2026-01-01', estado: 'COMPLETADA' }, '2026-06-01')).toBe(false)
  })

  it('es false cuando no hay fecha_limite', () => {
    expect(isTareaOverdue({ fecha_limite: null, estado: 'PENDIENTE' }, '2026-06-01')).toBe(false)
  })

  it('es false cuando la fecha límite es hoy o futura', () => {
    expect(isTareaOverdue({ fecha_limite: '2026-06-01', estado: 'PENDIENTE' }, '2026-06-01')).toBe(false)
    expect(isTareaOverdue({ fecha_limite: '2026-07-01', estado: 'PENDIENTE' }, '2026-06-01')).toBe(false)
  })
})

describe('groupProyectosByEtapa', () => {
  const etapas: TipoProyectoEtapa[] = [
    { id: 'e1', tipo_proyecto_id: 't1', nombre: 'Preproducción', orden: 1, es_etapa_final: false, created_at: '' },
    { id: 'e2', tipo_proyecto_id: 't1', nombre: 'Rodaje', orden: 2, es_etapa_final: false, created_at: '' },
  ]

  it('agrupa proyectos por etapa_id', () => {
    const proyectos = [baseProyecto({ id: 'SH001', etapa_id: 'e1' }), baseProyecto({ id: 'SH002', etapa_id: 'e2' })]
    const grupos = groupProyectosByEtapa(proyectos, etapas)
    expect(grupos.get('e1')?.map((p) => p.id)).toEqual(['SH001'])
    expect(grupos.get('e2')?.map((p) => p.id)).toEqual(['SH002'])
  })

  it('incluye todas las etapas aunque no tengan proyectos', () => {
    const grupos = groupProyectosByEtapa([], etapas)
    expect(grupos.get('e1')).toEqual([])
    expect(grupos.get('e2')).toEqual([])
  })

  it('ignora proyectos sin etapa_id', () => {
    const proyectos = [baseProyecto({ id: 'SH003', etapa_id: null })]
    const grupos = groupProyectosByEtapa(proyectos, etapas)
    expect(grupos.get('e1')).toEqual([])
    expect(grupos.get('e2')).toEqual([])
  })
})

describe('proyectosSinTipo', () => {
  it('retorna solo los proyectos sin tipo_proyecto_id', () => {
    const proyectos = [
      baseProyecto({ id: 'SH001', tipo_proyecto_id: 't1' }),
      baseProyecto({ id: 'SH002', tipo_proyecto_id: null }),
    ]
    expect(proyectosSinTipo(proyectos).map((p) => p.id)).toEqual(['SH002'])
  })
})

describe('resolverEtapaProyecto', () => {
  const tipos: TipoProyectoConEtapas[] = [
    {
      id: 't1', nombre: 'Grabación', activo: true, created_at: '',
      etapas: [
        { id: 'e1', tipo_proyecto_id: 't1', nombre: 'Preproducción', orden: 1, es_etapa_final: false, created_at: '' },
        { id: 'e2', tipo_proyecto_id: 't1', nombre: 'Rodaje', orden: 2, es_etapa_final: false, created_at: '' },
        { id: 'e3', tipo_proyecto_id: 't1', nombre: 'Finalizado', orden: 3, es_etapa_final: true, created_at: '' },
      ],
    },
  ]

  it('retorna null si el proyecto no tiene tipo_proyecto_id/etapa_id', () => {
    expect(resolverEtapaProyecto(baseProyecto({ tipo_proyecto_id: null, etapa_id: null }), tipos)).toBeNull()
  })

  it('retorna null si el tipo no está en el catálogo', () => {
    expect(resolverEtapaProyecto(baseProyecto({ tipo_proyecto_id: 'no-existe', etapa_id: 'e1' }), tipos)).toBeNull()
  })

  it('resuelve nombre y tono posicional de la primera etapa', () => {
    const resultado = resolverEtapaProyecto(baseProyecto({ tipo_proyecto_id: 't1', etapa_id: 'e1' }), tipos)
    expect(resultado).toEqual({ label: 'Preproducción', tone: 'draft' })
  })

  it('resuelve tono approved para la etapa final', () => {
    const resultado = resolverEtapaProyecto(baseProyecto({ tipo_proyecto_id: 't1', etapa_id: 'e3' }), tipos)
    expect(resultado).toEqual({ label: 'Finalizado', tone: 'approved' })
  })

  it('resuelve tono issued para etapas intermedias', () => {
    const resultado = resolverEtapaProyecto(baseProyecto({ tipo_proyecto_id: 't1', etapa_id: 'e2' }), tipos)
    expect(resultado).toEqual({ label: 'Rodaje', tone: 'issued' })
  })
})
