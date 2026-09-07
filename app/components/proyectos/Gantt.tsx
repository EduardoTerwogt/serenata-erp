import type { StatusTone } from '@/components/ui/StatusBadge'

export interface GanttBar {
  leftPct: number
  widthPct: number
  tone: StatusTone
  label: string
}

export interface GanttRow {
  id: string
  label: string
  bars: GanttBar[]
  hitoPct?: number
  hitoTone?: StatusTone
}

export interface GanttLegendItem {
  tone?: StatusTone
  label: string
  isHito?: boolean
}

interface GanttProps {
  rulerLabels: { label: string; widthPct: number }[]
  rows: GanttRow[]
  todayPct: number | null
  legend: GanttLegendItem[]
  emptyMessage?: string
}

const BAR_CLASS: Record<StatusTone, string> = {
  approved: 'bg-approved-bg text-approved-fg',
  issued: 'bg-issued-bg text-issued-fg',
  draft: 'bg-draft-bg text-draft-fg',
  cancelled: 'bg-cancelled-bg text-cancelled-fg',
}

const DOT_CLASS: Record<StatusTone, string> = {
  approved: 'bg-approved-bg',
  issued: 'bg-issued-bg',
  draft: 'bg-draft-bg',
  cancelled: 'bg-cancelled-bg',
}

// Gantt genérico, hecho a mano con divs posicionados por porcentaje (sin
// librería de gráficos/calendario -- Fase 5.2 Bloque 3.5). Reusado por el
// Cronograma de un proyecto (filas = tareas) y por Estatus y cronograma
// del listado general (filas = proyectos).
export function Gantt({ rulerLabels, rows, todayPct, legend, emptyMessage = 'Sin datos con fecha para mostrar' }: GanttProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-panel border border-hairline bg-card p-[19px] text-subtext text-content text-center">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-panel border border-hairline bg-card p-5 overflow-x-auto">
      <div className="flex ml-[180px] border-b border-hairline pb-2 mb-2.5 min-w-[600px]">
        {rulerLabels.map((r, i) => (
          <span key={i} className="flex-none text-eyebrow uppercase tracking-wide text-faint" style={{ width: `${r.widthPct}%` }}>
            {r.label}
          </span>
        ))}
      </div>

      {rows.map((row) => (
        <div key={row.id} className="flex items-center min-w-[780px] py-1.5 border-t border-hairline first:border-t-0">
          <div className="w-[180px] flex-none pr-3 text-content font-semibold text-body truncate">{row.label}</div>
          <div className="relative flex-1 h-[26px] bg-row rounded-[6px]">
            {row.bars.map((bar, i) => (
              <div
                key={i}
                className={`absolute top-[3px] h-5 rounded-[5px] flex items-center px-2 text-[11px] font-bold whitespace-nowrap overflow-hidden ${BAR_CLASS[bar.tone]}`}
                style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
              >
                {bar.label}
              </div>
            ))}
            {typeof row.hitoPct === 'number' && (
              <div
                className={`absolute -top-[3px] w-3.5 h-3.5 rounded-[3px] rotate-45 z-[2] ${DOT_CLASS[row.hitoTone ?? 'issued']}`}
                style={{ left: `${row.hitoPct}%`, transform: 'translateX(-50%) rotate(45deg)' }}
              />
            )}
            {todayPct !== null && (
              <div className="absolute -top-2 -bottom-2 w-0.5 bg-accent z-[3]" style={{ left: `${todayPct}%` }}>
                <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 text-[10px] font-bold text-accent whitespace-nowrap">Hoy</span>
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="flex gap-4 flex-wrap mt-4 text-content text-subtext">
        {legend.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-[3px] ${item.isHito ? `${DOT_CLASS[item.tone ?? 'issued']} rotate-45` : item.tone ? DOT_CLASS[item.tone] : 'bg-accent'}`}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
