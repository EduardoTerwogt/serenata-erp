import { describe, it, expect } from 'vitest'
import { resolveDocState } from './doc-state'
import type { ProyectoDocumento } from '@/lib/types'

const baseDoc = (overrides: Partial<ProyectoDocumento> = {}): ProyectoDocumento => ({
  id: overrides.id ?? 'doc-1',
  proyecto_id: 'SH001',
  tipo: 'BRIEF',
  titulo: null,
  contenido: {},
  archivo_url: null,
  archivo_nombre: null,
  auto_generado_at: '2026-01-01T00:00:00.000Z',
  editado_manualmente: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('resolveDocState', () => {
  it('STATUS_REPORT: cuenta los reportes existentes', () => {
    expect(resolveDocState('STATUS_REPORT', [])).toEqual({ kind: 'status_reports', count: 0 })
    expect(resolveDocState('STATUS_REPORT', [baseDoc(), baseDoc({ id: 'doc-2' })])).toEqual({ kind: 'status_reports', count: 2 })
  })

  it('REPORTE_CIERRE: locked si no existe, precargado si existe', () => {
    expect(resolveDocState('REPORTE_CIERRE', [])).toEqual({ kind: 'locked' })
    expect(resolveDocState('REPORTE_CIERRE', [baseDoc({ tipo: 'REPORTE_CIERRE' })])).toEqual({ kind: 'precargado' })
  })

  it('RUTA_CRITICA y ROADMAP siempre son automático', () => {
    expect(resolveDocState('RUTA_CRITICA', [])).toEqual({ kind: 'automatico' })
    expect(resolveDocState('ROADMAP', [baseDoc({ tipo: 'ROADMAP' })])).toEqual({ kind: 'automatico' })
  })

  it('RIESGOS: vacío si no existe el doc o si su lista de riesgos está vacía', () => {
    expect(resolveDocState('RIESGOS', [])).toEqual({ kind: 'vacio' })
    expect(resolveDocState('RIESGOS', [baseDoc({ tipo: 'RIESGOS', contenido: { riesgos: [] } })])).toEqual({ kind: 'vacio' })
  })

  it('RIESGOS: precargado si ya tiene al menos un riesgo capturado', () => {
    const doc = baseDoc({ tipo: 'RIESGOS', contenido: { riesgos: [{ id: 'r1', descripcion: 'x', probabilidad: 'baja', impacto: 'bajo', mitigacion: '', responsable_id: null }] } })
    expect(resolveDocState('RIESGOS', [doc])).toEqual({ kind: 'precargado' })
  })

  it('BRIEF/STAKEHOLDERS_RACI/CHARTER/PLAN_COMUNICACION son precargado', () => {
    expect(resolveDocState('BRIEF', [baseDoc()])).toEqual({ kind: 'precargado' })
    expect(resolveDocState('STAKEHOLDERS_RACI', [baseDoc({ tipo: 'STAKEHOLDERS_RACI' })])).toEqual({ kind: 'precargado' })
    expect(resolveDocState('CHARTER', [baseDoc({ tipo: 'CHARTER' })])).toEqual({ kind: 'precargado' })
    expect(resolveDocState('PLAN_COMUNICACION', [baseDoc({ tipo: 'PLAN_COMUNICACION' })])).toEqual({ kind: 'precargado' })
  })
})
