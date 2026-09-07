import type { StatusTone } from '@/components/ui/StatusBadge'

export interface KanbanColumn<T> {
  id: string
  label: string
  tone: StatusTone
  items: T[]
}

interface KanbanBoardProps<T> {
  columns: KanbanColumn<T>[]
  renderCard: (item: T) => React.ReactNode
  renderAddAction?: (columnId: string) => React.ReactNode
  keyExtractor: (item: T) => string
}

const DOT_CLASS: Record<StatusTone, string> = {
  approved: 'bg-approved-bg',
  issued: 'bg-issued-bg',
  draft: 'bg-draft-bg',
  cancelled: 'bg-cancelled-bg',
}

// Kanban genérico (Fase 5.2 Bloque 3.4) -- reusado por el tablero de
// tareas de un proyecto (columnas = EstadoTareaProyecto) y por el tablero
// de proyectos por tipo del listado general (columnas = etapas del tipo).
// Sin drag-and-drop: cada tarjeta cambia de columna vía un control propio
// (mismo criterio que el resto de la app).
export function KanbanBoard<T>({ columns, renderCard, renderAddAction, keyExtractor }: KanbanBoardProps<T>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
      {columns.map((columna) => (
        <div key={columna.id} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 px-1 pb-1">
            <span className={`w-2 h-2 rounded-full ${DOT_CLASS[columna.tone]}`} />
            <span className="text-eyebrow uppercase tracking-wide font-bold text-subtext">{columna.label}</span>
            <span className="text-eyebrow text-faint">{columna.items.length}</span>
          </div>
          {columna.items.map((item) => (
            <div key={keyExtractor(item)}>{renderCard(item)}</div>
          ))}
          {renderAddAction?.(columna.id)}
        </div>
      ))}
    </div>
  )
}
