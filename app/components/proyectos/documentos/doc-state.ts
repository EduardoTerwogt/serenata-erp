import type { ProyectoDocumento, TipoProyectoDocumento } from '@/lib/types'
import type { RiesgosContenido } from './contenido-types'

export type DocDisplayState =
  | { kind: 'automatico' }
  | { kind: 'precargado' }
  | { kind: 'vacio' }
  | { kind: 'locked' }
  | { kind: 'status_reports'; count: number }

/**
 * Resuelve el estado visual de una tarjeta de documento (Fase 5.2
 * Bloque 3.6) a partir de los documentos ya cargados de ese tipo.
 * `docsDeTipo` trae 0..N filas -- 0 o 1 para los tipos singleton, 0..N
 * para STATUS_REPORT (el único repetible).
 */
export function resolveDocState(tipo: TipoProyectoDocumento, docsDeTipo: ProyectoDocumento[]): DocDisplayState {
  if (tipo === 'STATUS_REPORT') {
    return { kind: 'status_reports', count: docsDeTipo.length }
  }

  if (tipo === 'REPORTE_CIERRE') {
    return docsDeTipo.length > 0 ? { kind: 'precargado' } : { kind: 'locked' }
  }

  if (tipo === 'RUTA_CRITICA' || tipo === 'ROADMAP') {
    return { kind: 'automatico' }
  }

  if (tipo === 'RIESGOS') {
    const doc = docsDeTipo[0]
    const contenido = doc?.contenido as unknown as RiesgosContenido | undefined
    const vacio = !doc || !contenido?.riesgos || contenido.riesgos.length === 0
    return vacio ? { kind: 'vacio' } : { kind: 'precargado' }
  }

  // BRIEF, STAKEHOLDERS_RACI, CHARTER, PLAN_COMUNICACION
  return { kind: 'precargado' }
}
