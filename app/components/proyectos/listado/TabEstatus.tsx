import { Gantt } from '@/app/components/proyectos/Gantt'
import { buildGanttRowsFromProyectos } from '@/app/components/proyectos/gantt-helpers'
import { isTareaOverdue, progresoEtapaProyecto, resolverEtapaProyecto } from '@/app/components/proyectos/kanban-helpers'
import type { StatusTone } from '@/components/ui/StatusBadge'
import type { TareaAgregada } from '@/lib/server/repositories/proyecto-tareas'
import type { Proyecto, TipoProyectoConEtapas } from '@/lib/types'

// bg-*-bg es un tinte translúcido (pensado para un pill con texto encima) --
// la barra de distribución y el punto de leyenda no llevan texto, necesitan
// el tono saturado (-fg) o se ven lavados.
const BAR_BG_CLASS: Record<StatusTone, string> = {
  approved: 'bg-approved-fg',
  issued: 'bg-issued-fg',
  draft: 'bg-draft-fg',
  cancelled: 'bg-cancelled-fg',
}

interface TabEstatusProps {
  proyectos: Proyecto[]
  tipos: TipoProyectoConEtapas[]
  tareasAgregadas: TareaAgregada[]
  loadingTareas: boolean
}

function Stat({ label, value, sub, className = '' }: { label: string; value: React.ReactNode; sub?: string; className?: string }) {
  return (
    <div className="rounded-panel border border-hairline bg-card p-[18px]">
      <p className="text-eyebrow uppercase tracking-wide text-subtext">{label}</p>
      <p className={`mt-1.5 text-h3 font-bold text-ink ${className}`}>{value}</p>
      {sub && <p className="mt-1 text-eyebrow text-faint">{sub}</p>}
    </div>
  )
}

const GANTT_LEGEND = [
  { tone: 'draft' as const, label: 'Preproducción / etapa inicial' },
  { tone: 'issued' as const, label: 'En proceso' },
  { tone: 'approved' as const, label: 'Finalizado' },
]

export function TabEstatus({ proyectos, tipos, tareasAgregadas, loadingTareas }: TabEstatusProps) {
  const proyectosActivos = proyectos.filter((p) => p.estado !== 'FINALIZADO')

  const progresos = proyectosActivos
    .map((p) => progresoEtapaProyecto(p, tipos))
    .filter((p): p is number => p !== null)
  const avancePromedio = progresos.length > 0
    ? Math.round((progresos.reduce((sum, p) => sum + p, 0) / progresos.length) * 100)
    : null

  const proyectosConVencidas = new Set(tareasAgregadas.filter((t) => isTareaOverdue(t)).map((t) => t.proyecto_id)).size

  const distribucion = new Map<string, { count: number; tone: StatusTone }>()
  for (const p of proyectosActivos) {
    const etapa = resolverEtapaProyecto(p, tipos)
    const key = etapa?.label ?? 'Sin etapa'
    const existente = distribucion.get(key)
    if (existente) existente.count += 1
    else distribucion.set(key, { count: 1, tone: etapa?.tone ?? 'draft' })
  }

  const { rows, rulerLabels, todayPct, omitidos } = buildGanttRowsFromProyectos(proyectosActivos, tipos)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-content font-semibold text-ink" style={{ fontSize: 'var(--text-h3)' }}>Estatus general</h2>
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Stat label="Proyectos activos" value={proyectosActivos.length} />
        <Stat
          label="Avance promedio"
          value={avancePromedio !== null ? `${avancePromedio}%` : '—'}
          sub={avancePromedio !== null ? `De ${progresos.length} proyecto${progresos.length === 1 ? '' : 's'} con tipo asignado` : 'Sin proyectos con tipo asignado'}
          className="text-accent"
        />
        <Stat
          label="Con tareas vencidas"
          value={loadingTareas ? '...' : proyectosConVencidas}
          sub="Necesitan atención"
          className={proyectosConVencidas > 0 ? 'text-cancelled-fg' : undefined}
        />
        <div className="rounded-panel border border-hairline bg-card p-[18px]">
          <p className="text-eyebrow uppercase tracking-wide text-subtext">Distribución por etapa</p>
          {distribucion.size === 0 ? (
            <p className="mt-2 text-faint text-content">Sin datos</p>
          ) : (
            <>
              <div className="flex h-3.5 rounded-[7px] overflow-hidden mt-3">
                {Array.from(distribucion.entries()).map(([label, { count, tone }]) => (
                  <span key={label} style={{ width: `${(count / proyectosActivos.length) * 100}%` }} className={`h-full ${BAR_BG_CLASS[tone]}`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-eyebrow text-subtext">
                {Array.from(distribucion.entries()).map(([label, { count, tone }]) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-[2px] ${BAR_BG_CLASS[tone]}`} />
                    {label} ({count})
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <h2 className="text-content font-semibold text-ink mt-1.5" style={{ fontSize: 'var(--text-h3)' }}>Cronograma general (todos los proyectos)</h2>
      <Gantt
        rows={rows}
        rulerLabels={rulerLabels}
        todayPct={todayPct}
        legend={GANTT_LEGEND}
        emptyMessage="Ningún proyecto activo tiene fecha de entrega todavía."
      />
      {omitidos > 0 && (
        <p className="text-faint text-content">{omitidos} proyecto{omitidos === 1 ? '' : 's'} sin fecha, no se muestran en el cronograma.</p>
      )}
    </div>
  )
}
