import type { EstadoProyecto, ProyectoTarea } from '@/lib/types'

const ESTADOS_LEGADO: readonly EstadoProyecto[] = [
  'PREPRODUCCION', 'RODAJE', 'POSTPRODUCCION', 'FINALIZADO',
]

// Mapa de nombres de etapa (acentuados, como se guardan en
// tipo_proyecto_etapas.nombre) al enum legado `proyectos.estado`. Solo las
// etapas de Grabación calzan 1:1 -- cualquier otro tipo (Concierto, Diseño
// de Show) no tiene equivalente legado y `estado` se deja sin tocar.
const NOMBRE_ETAPA_A_ESTADO_LEGADO: Record<string, EstadoProyecto> = {
  'Preproducción': 'PREPRODUCCION',
  'Rodaje': 'RODAJE',
  'Postproducción': 'POSTPRODUCCION',
  'Finalizado': 'FINALIZADO',
}

/**
 * Resuelve el `estado` legado equivalente a una etapa, si existe. Se usa
 * para mantener sincronizado el campo de texto legado (del que aún
 * dependen badges/filtros/generarHistorialProyecto) mientras el código no
 * termine de migrar a etapa_id -- ver comentario de columna en la
 * migración fase52_proyectos_pm_schema.
 */
export function estadoLegadoParaEtapa(nombreEtapa: string): EstadoProyecto | null {
  return NOMBRE_ETAPA_A_ESTADO_LEGADO[nombreEtapa] ?? null
}

export function esEstadoLegadoValido(valor: string): valor is EstadoProyecto {
  return (ESTADOS_LEGADO as readonly string[]).includes(valor)
}

/**
 * Calcula fecha_limite de una tarea copiada de plantilla: fecha_entrega del
 * proyecto menos dias_antes_entrega. Si falta cualquiera de los dos datos,
 * no hay fecha calculable -- la tarea queda sin fecha_limite (editable a
 * mano), no se asume nada.
 */
export function calcularFechaLimite(
  fechaEntrega: string | null | undefined,
  diasAntesEntrega: number | null | undefined
): string | null {
  if (!fechaEntrega || diasAntesEntrega == null) return null
  const base = new Date(`${fechaEntrega}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() - diasAntesEntrega)
  return base.toISOString().slice(0, 10)
}

/**
 * Ruta crítica: hitos del proyecto ordenados por fecha_limite (los sin
 * fecha van al final). Misma fuente que alimenta el cronograma real-vs-
 * planeado del Reporte de Cierre (Bloque 4) -- un solo dato, dos vistas.
 */
export function ordenarRutaCritica(tareas: ProyectoTarea[]): ProyectoTarea[] {
  return tareas
    .filter((t) => t.es_hito)
    .slice()
    .sort((a, b) => {
      if (!a.fecha_limite && !b.fecha_limite) return 0
      if (!a.fecha_limite) return 1
      if (!b.fecha_limite) return -1
      return a.fecha_limite.localeCompare(b.fecha_limite)
    })
}

export interface SemanaRoadmap {
  semana_inicio: string
  hitos: ProyectoTarea[]
}

/**
 * Agrupa los hitos por semana (lunes ISO de la semana de fecha_limite) para
 * el documento Roadmap. Hitos sin fecha_limite no aparecen en el roadmap
 * (no hay semana a la que asignarlos) pero sí siguen en Ruta Crítica.
 */
export function agruparHitosPorSemana(tareas: ProyectoTarea[]): SemanaRoadmap[] {
  const hitos = ordenarRutaCritica(tareas).filter((t) => t.fecha_limite)
  const semanas = new Map<string, ProyectoTarea[]>()

  for (const hito of hitos) {
    const fecha = new Date(`${hito.fecha_limite}T00:00:00Z`)
    const diaSemana = fecha.getUTCDay() || 7 // domingo=0 -> 7
    fecha.setUTCDate(fecha.getUTCDate() - diaSemana + 1) // lunes ISO
    const key = fecha.toISOString().slice(0, 10)
    if (!semanas.has(key)) semanas.set(key, [])
    semanas.get(key)!.push(hito)
  }

  return Array.from(semanas.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana_inicio, hitos]) => ({ semana_inicio, hitos }))
}
