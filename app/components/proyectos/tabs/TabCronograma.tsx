import { Gantt } from '@/app/components/proyectos/Gantt'
import { buildGanttRowsFromTareas } from '@/app/components/proyectos/gantt-helpers'
import type { ProyectoTarea } from '@/lib/types'

interface TabCronogramaProps {
  tareas: ProyectoTarea[]
}

const LEGEND = [
  { tone: 'draft' as const, label: 'Pendiente' },
  { tone: 'issued' as const, label: 'En progreso' },
  { tone: 'approved' as const, label: 'Completada' },
  { tone: 'cancelled' as const, label: 'Bloqueada' },
  { tone: 'issued' as const, label: 'Hito', isHito: true },
]

export function TabCronograma({ tareas }: TabCronogramaProps) {
  const { rows, rulerLabels, todayPct } = buildGanttRowsFromTareas(tareas)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-h3 font-semibold text-ink">Cronograma del proyecto</h2>
      <Gantt
        rows={rows}
        rulerLabels={rulerLabels}
        todayPct={todayPct}
        legend={LEGEND}
        emptyMessage="Ninguna tarea tiene fecha límite todavía -- agrégalas desde el Tablero de tareas."
      />
      <p className="text-faint text-content">
        Mismas tareas del tablero, ubicadas en el tiempo -- la barra va de cuándo se creó la tarea a su fecha límite;
        los diamantes marcan los hitos. Es la misma fuente de datos que la Ruta Crítica y el reporte de cierre, solo
        que aquí se ve como línea de tiempo.
      </p>
    </div>
  )
}
