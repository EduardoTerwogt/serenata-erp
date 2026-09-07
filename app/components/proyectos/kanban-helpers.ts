import { toneForEtapaPosicion, type StatusTone } from '@/components/ui/StatusBadge'
import type { EstadoTareaProyecto, Proyecto, ProyectoTarea, TipoProyectoConEtapas, TipoProyectoEtapa } from '@/lib/types'

const ORDEN_ESTADOS: EstadoTareaProyecto[] = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA']

export function groupTareasByEstado(tareas: ProyectoTarea[]): Record<EstadoTareaProyecto, ProyectoTarea[]> {
  const grupos: Record<EstadoTareaProyecto, ProyectoTarea[]> = {
    PENDIENTE: [],
    EN_PROGRESO: [],
    COMPLETADA: [],
    BLOQUEADA: [],
  }
  for (const tarea of tareas) {
    grupos[tarea.estado].push(tarea)
  }
  return grupos
}

export { ORDEN_ESTADOS }

export function isTareaOverdue(tarea: Pick<ProyectoTarea, 'fecha_limite' | 'estado'>, todayISO?: string): boolean {
  if (!tarea.fecha_limite || tarea.estado === 'COMPLETADA') return false
  const hoy = todayISO ?? new Date().toISOString().slice(0, 10)
  return tarea.fecha_limite < hoy
}

/**
 * Agrupa proyectos por etapa de un tipo dado -- usado por el tablero por
 * tipo del listado general. Solo agrupa proyectos que ya tienen ese
 * tipo_proyecto_id asignado; los sin tipo se resuelven aparte con
 * proyectosSinTipo().
 */
export function groupProyectosByEtapa(
  proyectos: Proyecto[],
  etapas: TipoProyectoEtapa[]
): Map<string, Proyecto[]> {
  const grupos = new Map<string, Proyecto[]>(etapas.map((e) => [e.id, []]))
  for (const proyecto of proyectos) {
    if (!proyecto.etapa_id) continue
    const lista = grupos.get(proyecto.etapa_id)
    if (lista) lista.push(proyecto)
  }
  return grupos
}

export function proyectosSinTipo(proyectos: Proyecto[]): Proyecto[] {
  return proyectos.filter((p) => !p.tipo_proyecto_id)
}

export interface EtapaResuelta {
  label: string
  tone: StatusTone
}

/**
 * Resuelve la etapa actual de un proyecto (nombre + tono posicional) a
 * partir del catálogo completo de tipos -- reusado por el badge del hero
 * del detalle de proyecto y por la vista "Lista" del listado general.
 * Retorna null si el proyecto no tiene tipo/etapa o no se encuentran en el
 * catálogo (dato inconsistente, no se debería asumir nada).
 */
export function resolverEtapaProyecto(proyecto: Proyecto, tipos: TipoProyectoConEtapas[]): EtapaResuelta | null {
  if (!proyecto.tipo_proyecto_id || !proyecto.etapa_id) return null
  const tipo = tipos.find((t) => t.id === proyecto.tipo_proyecto_id)
  if (!tipo) return null

  const etapas = [...tipo.etapas].sort((a, b) => a.orden - b.orden)
  const index = etapas.findIndex((e) => e.id === proyecto.etapa_id)
  if (index === -1) return null

  const etapa = etapas[index]
  return { label: etapa.nombre, tone: toneForEtapaPosicion(index, etapa.es_etapa_final) }
}

/**
 * Proxy de avance del proyecto dentro de su pipeline: posición de su etapa
 * actual sobre el total de etapas de su tipo (0 = primera etapa, 1 =
 * etapa final). No es "% de tareas completadas" (esa vista vive en el
 * tablero de tareas de cada proyecto) -- es "qué tan lejos va en su
 * proceso", usado para el promedio del dashboard de Estatus. Retorna null
 * en los mismos casos que resolverEtapaProyecto, o si el tipo tiene una
 * sola etapa (no hay progresión que medir).
 */
export function progresoEtapaProyecto(proyecto: Proyecto, tipos: TipoProyectoConEtapas[]): number | null {
  if (!proyecto.tipo_proyecto_id || !proyecto.etapa_id) return null
  const tipo = tipos.find((t) => t.id === proyecto.tipo_proyecto_id)
  if (!tipo) return null

  const etapas = [...tipo.etapas].sort((a, b) => a.orden - b.orden)
  if (etapas.length < 2) return null
  const index = etapas.findIndex((e) => e.id === proyecto.etapa_id)
  if (index === -1) return null

  return index / (etapas.length - 1)
}
