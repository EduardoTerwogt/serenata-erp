import { formatDateDisplay } from '@/lib/format-date'
import { isTareaOverdue } from '@/app/components/proyectos/kanban-helpers'
import type { TareaAgregada } from '@/lib/server/repositories/proyecto-tareas'

interface TabTareasProps {
  tareas: TareaAgregada[]
  loading: boolean
}

export function TabTareas({ tareas, loading }: TabTareasProps) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-control bg-row" />)}
      </div>
    )
  }

  if (tareas.length === 0) {
    return <p className="text-faint text-content italic">No hay tareas pendientes en ningún proyecto activo.</p>
  }

  const grupos = new Map<string, TareaAgregada[]>()
  for (const tarea of tareas) {
    const lista = grupos.get(tarea.proyecto_id) ?? []
    lista.push(tarea)
    grupos.set(tarea.proyecto_id, lista)
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-subtext text-content mb-1">
        Checklist de todos los proyectos activos, vencidas primero -- mismo tablero de tareas de cada proyecto, visto en conjunto.
      </p>

      {Array.from(grupos.entries()).map(([proyectoId, tareasDelProyecto]) => (
        <div key={proyectoId} className="mt-3.5 first:mt-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-eyebrow text-accent">{proyectoId}</span>
            <span className="text-content font-bold text-ink">{tareasDelProyecto[0].proyecto_nombre}</span>
          </div>
          <div className="space-y-1.5">
            {tareasDelProyecto.map((tarea) => {
              const vencida = isTareaOverdue(tarea)
              return (
                <div key={tarea.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-row border border-hairline rounded-control">
                  <span className={`w-[18px] h-[18px] rounded-[5px] border flex-none flex items-center justify-center text-[12px] ${
                    tarea.estado === 'COMPLETADA' ? 'bg-approved-bg border-approved-bg text-approved-fg' : 'border-hairline'
                  }`}>
                    {tarea.estado === 'COMPLETADA' && '✓'}
                  </span>
                  <span className={`flex-1 min-w-0 text-content truncate ${tarea.estado === 'COMPLETADA' ? 'text-faint line-through' : 'text-body'}`}>
                    {tarea.titulo}
                  </span>
                  <span className={`text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[5px] whitespace-nowrap ${
                    tarea.origen === 'manual' ? 'text-accent bg-accent/[0.14]' : 'text-subtext bg-row-alt'
                  }`}>
                    {tarea.origen === 'manual' ? 'Manual' : 'Plantilla'}
                  </span>
                  <span className={`text-eyebrow whitespace-nowrap ${vencida ? 'text-cancelled-fg font-bold' : 'text-faint'}`}>
                    {tarea.estado === 'COMPLETADA' && tarea.fecha_completada
                      ? `Completada ${formatDateDisplay(tarea.fecha_completada)}`
                      : vencida ? `Venció ${formatDateDisplay(tarea.fecha_limite)}` : `Vence ${formatDateDisplay(tarea.fecha_limite)}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="text-faint text-content mt-4">
        Las etiquetas &quot;Plantilla&quot;/&quot;Manual&quot; muestran qué vino de la plantilla del tipo de proyecto y qué se
        agregó a mano -- esa señal es la que en el futuro alimenta las sugerencias de mejorar la plantilla.
      </p>
    </div>
  )
}
