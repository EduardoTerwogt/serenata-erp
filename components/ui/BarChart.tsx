// Hecho a mano con divs, sin librería -- mismo criterio ya usado en el repo
// para el Gantt de Proyectos (Fase 5.6, panel "Balance por periodo").
export interface BarChartDatum {
  label: string
  ingresos: number
  egresos: number
}

interface BarChartProps {
  data: BarChartDatum[]
  height?: number
  onBarClick?: (datum: BarChartDatum) => void
  format?: (value: number) => string
}

export function BarChart({ data, height = 186, onBarClick, format = (v) => `$${v.toLocaleString('es-MX')}` }: BarChartProps) {
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.egresos]))

  return (
    <div className="flex items-end gap-2 md:gap-4" style={{ height }}>
      {data.map((d) => (
        <button
          key={d.label}
          type="button"
          onClick={() => onBarClick?.(d)}
          disabled={!onBarClick}
          title={`${d.label} — Ingresos ${format(d.ingresos)} / Egresos ${format(d.egresos)}`}
          className="flex h-full flex-1 flex-col items-center justify-end gap-2 rounded-md px-1 pt-2 transition-colors enabled:hover:bg-row-alt enabled:cursor-pointer"
        >
          <div className="flex flex-1 items-end gap-1">
            {/* bg-approved-bg/bg-cancelled-bg etc. son tintes translúcidos pensados
                para el fondo de un pill de estado (ver StatusBadge) -- una barra
                sólida necesita el tono saturado (fg), no el tinte, o se ve lavada. */}
            <div
              className="w-3 rounded-t-sm md:w-4"
              style={{ background: 'var(--sn-status-approved-fg)', height: `${Math.max((d.ingresos / max) * 100, d.ingresos > 0 ? 2 : 0)}%` }}
            />
            <div
              className="w-3 rounded-t-sm bg-accent md:w-4"
              style={{ height: `${Math.max((d.egresos / max) * 100, d.egresos > 0 ? 2 : 0)}%` }}
            />
          </div>
          <span className="text-xs text-faint whitespace-nowrap">{d.label}</span>
        </button>
      ))}
    </div>
  )
}
