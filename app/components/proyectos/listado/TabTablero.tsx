import Link from 'next/link'
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs'
import { toneForEtapaPosicion } from '@/components/ui/StatusBadge'
import { KanbanBoard, type KanbanColumn } from '@/app/components/proyectos/KanbanBoard'
import { ProyectoCard } from '@/app/components/proyectos/listado/ProyectoCard'
import { groupProyectosByEtapa, proyectosSinTipo } from '@/app/components/proyectos/kanban-helpers'
import type { Proyecto, TipoProyectoConEtapas } from '@/lib/types'

interface TabTableroProps {
  proyectos: Proyecto[]
  tiposActivos: TipoProyectoConEtapas[]
  tipoActivoId: string | null
  onCambiarTipoActivo: (id: string) => void
}

export function TabTablero({ proyectos, tiposActivos, tipoActivoId, onCambiarTipoActivo }: TabTableroProps) {
  const sinTipo = proyectosSinTipo(proyectos)
  const tipoActivo = tiposActivos.find((t) => t.id === tipoActivoId) ?? tiposActivos[0] ?? null

  const tabs: FilterTab<string>[] = tiposActivos.map((t) => ({ value: t.id, label: t.nombre }))

  const etapasOrdenadas = tipoActivo ? [...tipoActivo.etapas].sort((a, b) => a.orden - b.orden) : []
  const grupos = tipoActivo ? groupProyectosByEtapa(proyectos, etapasOrdenadas) : new Map<string, Proyecto[]>()

  const columnas: KanbanColumn<Proyecto>[] = etapasOrdenadas.map((etapa, i) => ({
    id: etapa.id,
    label: etapa.nombre,
    tone: toneForEtapaPosicion(i, etapa.es_etapa_final),
    items: grupos.get(etapa.id) ?? [],
  }))

  return (
    <div className="flex flex-col gap-4">
      {sinTipo.length > 0 && (
        <div className="rounded-panel border border-dashed border-hairline bg-card p-[19px]">
          <p className="text-content font-semibold text-ink mb-2.5">Sin tipo asignado</p>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {sinTipo.map((p) => (
              <Link key={p.id} href={`/proyectos/${p.id}`} className="bg-row border border-hairline rounded-control p-3 hover:bg-row-alt transition-colors">
                <p className="text-eyebrow font-mono text-accent">{p.id}</p>
                <p className="text-content font-bold text-ink mt-0.5">{p.proyecto}</p>
                <p className="text-eyebrow text-accent mt-1">Configurar tipo →</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tipoActivo ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-subtext text-content">Cada tipo de proyecto tiene sus propias etapas -- no se puede mezclar en un solo tablero.</p>
            {tabs.length > 1 && <FilterTabs tabs={tabs} value={tipoActivo.id} onChange={onCambiarTipoActivo} />}
          </div>

          <KanbanBoard columns={columnas} keyExtractor={(p) => p.id} renderCard={(p) => <ProyectoCard proyecto={p} />} />
        </>
      ) : (
        <p className="text-faint text-content">Todavía no hay tipos de proyecto configurados.</p>
      )}
    </div>
  )
}
