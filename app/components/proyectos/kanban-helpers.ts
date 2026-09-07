import type { EstadoTareaProyecto, Proyecto, ProyectoTarea, TipoProyectoEtapa } from '@/lib/types'

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
