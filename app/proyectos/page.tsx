'use client'

import { SectionHero } from '@/components/ui/SectionHero'
import { Button } from '@/components/ui/Button'
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
    <div className="flex flex-col gap-[19px]">
      <SectionHero
        title="Proyectos"
        action={
          <Button variant="secondary" href="/proyectos/tipos" iconRight="arrow-right">
            Configurar tipos de proyecto
          </Button>
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
