import { Avatar } from '@/components/ui/Avatar'
import { formatDateDisplay } from '@/lib/format-date'
import { isTareaOverdue } from '@/app/components/proyectos/kanban-helpers'
import type { ProyectoTarea } from '@/lib/types'

interface TareaCardProps {
  tarea: ProyectoTarea
  checklistProgreso?: { completados: number; total: number }
  onClick: () => void
}

function initialesDe(nombre: string | null | undefined): string {
  if (!nombre) return '?'
  const partes = nombre.trim().split(/\s+/)
  return partes.length > 1 ? `${partes[0][0]}${partes[1][0]}` : partes[0].slice(0, 2)
}

export function TareaCard({ tarea, checklistProgreso, onClick }: TareaCardProps) {
  const vencida = isTareaOverdue(tarea)
  const fechaLabel = tarea.estado === 'COMPLETADA' && tarea.fecha_completada
    ? `Completada ${formatDateDisplay(tarea.fecha_completada)}`
    : tarea.fecha_limite
      ? `Vence ${formatDateDisplay(tarea.fecha_limite)}`
      : 'Sin fecha límite'

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-panel border border-hairline bg-card p-3.5 flex flex-col gap-2.5 hover:bg-row-alt transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 text-content font-semibold text-ink leading-snug">{tarea.titulo}</span>
        {tarea.es_hito && <span className="text-eyebrow font-bold text-accent whitespace-nowrap">★ Hito</span>}
        <span className={`text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[5px] whitespace-nowrap ${
          tarea.origen === 'manual' ? 'text-accent bg-accent/[0.14]' : 'text-subtext bg-row-alt'
        }`}>
          {tarea.origen === 'manual' ? 'Manual' : 'Plantilla'}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Avatar initials={initialesDe(tarea.asignado_a_nombre)} size={24} tone={tarea.asignado_a ? 'accent' : 'neutral'} />
        <span className={`text-eyebrow ${vencida ? 'text-cancelled-fg font-semibold' : 'text-subtext'}`}>{fechaLabel}</span>
      </div>

      {checklistProgreso && checklistProgreso.total > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-eyebrow text-faint">Checklist {checklistProgreso.completados}/{checklistProgreso.total}</span>
          <div className="h-1 rounded-[2px] bg-row-alt overflow-hidden">
            <span
              className="block h-full bg-accent"
              style={{ width: `${Math.round((checklistProgreso.completados / checklistProgreso.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </button>
  )
}
