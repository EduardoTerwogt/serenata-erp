'use client'

import Link from 'next/link'
import { SectionHero } from '@/components/ui/SectionHero'
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs'
import { useProyectosListado, type ListadoTab } from '@/app/components/proyectos/useProyectosListado'
import { TabTablero } from '@/app/components/proyectos/listado/TabTablero'
import { TabLista } from '@/app/components/proyectos/listado/TabLista'
import { TabTareas } from '@/app/components/proyectos/listado/TabTareas'
import { TabEstatus } from '@/app/components/proyectos/listado/TabEstatus'

const TABS: FilterTab<ListadoTab>[] = [
  { value: 'tablero', label: 'Tablero' },
  { value: 'tareas', label: 'Tareas' },
  { value: 'estatus', label: 'Estatus y cronograma' },
  { value: 'lista', label: 'Lista' },
]

export default function ProyectosPage() {
  const {
    ltab, setLtab, proyectos, loading, tiposApi, tiposActivos, tipoActivoId, setTipoActivoId,
    tareasAgregadas, loadingTareas,
  } = useProyectosListado()

  return (
    <div className="px-5 pt-6 pb-6 md:p-8 flex flex-col gap-[19px]">
      <SectionHero
        title="Proyectos"
        subtitle="Vista general del pipeline completo"
        action={
          <Link
            href="/proyectos/tipos"
            className="flex h-[var(--control-height-lg)] items-center justify-center gap-2 rounded-control border border-hairline bg-input px-[18px] text-content font-semibold text-body transition-colors hover:bg-row-alt"
          >
            Configurar tipos de proyecto →
          </Link>
        }
      />

      <FilterTabs tabs={TABS} value={ltab} onChange={setLtab} />

      {loading || tiposApi.loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-panel border border-hairline bg-card h-32" />
          ))}
        </div>
      ) : (
        <>
          {ltab === 'tablero' && (
            <TabTablero
              proyectos={proyectos}
              tiposActivos={tiposActivos}
              tipoActivoId={tipoActivoId}
              onCambiarTipoActivo={setTipoActivoId}
            />
          )}
          {ltab === 'lista' && <TabLista proyectos={proyectos} tipos={tiposApi.tipos} />}
          {ltab === 'tareas' && <TabTareas tareas={tareasAgregadas} loading={loadingTareas} />}
          {ltab === 'estatus' && (
            <TabEstatus proyectos={proyectos} tipos={tiposApi.tipos} tareasAgregadas={tareasAgregadas} loadingTareas={loadingTareas} />
          )}
        </>
      )}
    </div>
  )
}
