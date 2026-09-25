'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { TableFooter } from '@/components/ui/TableFooter'
import type { TableGroup } from '@/components/ResponsiveTableCard'
import type { ConceptoLista, ConceptoVista, MesPeriodo, PeriodoRespuesta, VistaCuentas } from '@/lib/shared/cuentas/periodo-tipos'
import { ListaConceptos } from './Conceptos'
import { Chips, FiltrosEscritorio, HojaFiltros, chipsActivos, reglasFiltros, type CambioFiltros } from './Filtros'
import { MESES_LARGOS, etiquetaPeriodo, plural } from './formato'
import { BotonPeriodo, HojaPeriodo, PeriodoEscritorio } from './Periodo'
import { CuerpoProyecto, EncabezadoProyecto, ProyectoPanel } from './ProyectoPanel'
import { ListaCompacta, ListaProyectos, agruparProyectos } from './Proyectos'
import { Totales } from './Totales'
import { useEsAncho, useEsEscritorio } from './ui'
import { PAGE_SIZE_LISTA, useCuentasDatos } from './useCuentasDatos'
import { useCuentasUrl, type EstadoCuentas } from './useCuentasUrl'

const VISTAS: { value: VistaCuentas; label: string }[] = [
  { value: 'proyectos', label: 'Por proyecto' },
  { value: 'lista', label: 'Lista' },
]

function Contador({ n }: { n: number }) {
  if (n <= 0) return null
  return <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent px-[5px] text-[11px] font-semibold text-white">{n}</span>
}

function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 rounded-panel border border-hairline bg-card px-[18px] py-7 text-center text-[13.5px] text-faint md:mx-0 md:px-5 md:py-[34px] md:text-[14px]">{children}</div>
  )
}

function gruposLista(p: PeriodoRespuesta, agrupar: boolean): TableGroup<ConceptoLista>[] {
  const items = p.lista.items
  if (!(p.mes === 'todo' && agrupar)) return [{ key: 'todos', label: '', items }]
  const grupos: TableGroup<ConceptoLista>[] = []
  for (const c of items) {
    const key = c.proyecto.sin_fecha ? 'sin-fecha' : `m${c.proyecto.mes}`
    let g = grupos.find((x) => x.key === key)
    if (!g) grupos.push((g = { key, label: c.proyecto.sin_fecha ? 'Sin fecha' : `${MESES_LARGOS[(c.proyecto.mes ?? 1) - 1]} ${p.anio}`, items: [] }))
    g.items.push(c)
  }
  return grupos.map((g) => ({ ...g, sub: plural(g.items.length, 'concepto', 'conceptos') }))
}

/**
 * Pantalla principal de Cuentas (Rediseño B4): periodo por mes del evento,
 * filtros, totales, tarjetas de proyecto con maestro-detalle y Lista. Un solo
 * árbol para escritorio y móvil (O7); el estado vive en la URL (S15).
 */
export function CuentasApp({ extras }: { extras?: (ctx: { estado: EstadoCuentas; abrir: ReturnType<typeof useCuentasUrl>['abrir']; cerrar: ReturnType<typeof useCuentasUrl>['cerrar']; recargar: () => void; hoy: string | null }) => ReactNode }) {
  const { estado, filtrar, abrir, cerrar } = useCuentasUrl()
  const { periodo, resumen, cargando, error, recargar } = useCuentasDatos(estado)
  const escritorio = useEsEscritorio()
  const ancho = useEsAncho()
  const [buscando, setBuscando] = useState(false)

  const cambiarFiltros = useCallback((c: CambioFiltros) => filtrar(reglasFiltros(estado, c)), [estado, filtrar])
  const anio = periodo?.anio ?? estado.anio ?? new Date().getFullYear()
  const mes: MesPeriodo = periodo?.mes ?? estado.mes ?? 'todo'

  const abrirProyecto = useCallback(
    (id: string) => {
      // Tocar el proyecto seleccionado lo deselecciona (README).
      if (estado.proyecto === id) cerrar({ proyecto: null, det: null, tab: null })
      else abrir({ proyecto: id, det: null, tab: null })
    },
    [abrir, cerrar, estado.proyecto]
  )
  const abrirConcepto = useCallback((c: ConceptoVista) => abrir({ det: c.key, tab: null }), [abrir])

  const grupos = useMemo(
    () => (periodo ? agruparProyectos(periodo.proyectos.items, periodo.sin_fecha, periodo.anio, periodo.mes === 'todo' && estado.agrupar) : []),
    [periodo, estado.agrupar]
  )

  const onMes = (m: MesPeriodo) => {
    // En la hoja Periodo elegir mes también la cierra: una sola navegación.
    if (estado.sheet === 'periodo') cerrar({ sheet: null, mes: m, page: 1 })
    else filtrar({ mes: m })
  }
  // Al cambiar de año el servidor elige el mes: el actual o el último con datos (S16).
  const onAnio = (a: number) => filtrar({ anio: a, mes: null, proyecto: null })

  const totalProyectos = periodo ? periodo.proyectos.total + periodo.sin_fecha.length : 0
  const alcance = periodo ? `${etiquetaPeriodo(periodo.anio, periodo.mes)} · ${plural(periodo.proyectos.total, 'proyecto', 'proyectos')}` : ''
  const sel = periodo?.seleccionado ?? null
  const hayProyectos = totalProyectos > 0
  const hayFilas = (periodo?.lista.total ?? 0) > 0
  const avisos = resumen?.avisos ?? 0
  const nFiltros = chipsActivos(estado).length

  const resultadosFiltros = periodo
    ? estado.vista === 'lista'
      ? `Ver ${plural(periodo.lista.total, 'concepto', 'conceptos')}`
      : `Ver ${plural(totalProyectos, 'proyecto', 'proyectos')}`
    : 'Ver resultados'

  const pieLista = periodo && (
    <div className="md:contents">
      <div className="hidden md:block">
        <TableFooter
          shown={periodo.lista.items.length}
          total={periodo.lista.total}
          unit={`conceptos de ${plural(periodo.lista.proyectos, 'proyecto', 'proyectos')}`}
          page={periodo.lista.page}
          pageCount={Math.ceil(periodo.lista.total / PAGE_SIZE_LISTA)}
          onPageChange={(page) => filtrar({ page })}
        />
      </div>
      <div className="text-center text-[11px] text-subtext md:hidden">
        Mostrando {plural(periodo.lista.items.length, 'concepto', 'conceptos')} de {plural(periodo.lista.proyectos, 'proyecto', 'proyectos')}
        {periodo.lista.total > periodo.lista.items.length && (
          <button type="button" className="ml-2 text-accent" onClick={() => filtrar({ page: periodo.lista.page + 1 })}>
            Siguientes
          </button>
        )}
      </div>
    </div>
  )

  const cuerpo = () => {
    if (!periodo) return cargando ? <SectionLoading /> : null
    if (estado.vista === 'lista') {
      return hayFilas ? <ListaConceptos grupos={gruposLista(periodo, estado.agrupar)} pie={pieLista} onAbrir={abrirConcepto} /> : <Vacio>Sin cuentas en este periodo con estos filtros.</Vacio>
    }
    if (!hayProyectos && !sel) return <Vacio>Sin cuentas en este periodo con estos filtros.</Vacio>

    // Escritorio con proyecto seleccionado: maestro-detalle desde xl; por
    // debajo el detalle ocupa todo el ancho y se regresa con el chevron (S14).
    if (escritorio && sel) {
      const panel = <ProyectoPanel p={sel} onAbrirConcepto={abrirConcepto} onVolver={ancho ? undefined : () => cerrar({ proyecto: null })} />
      if (!ancho) return panel
      return (
        <div className="grid items-start gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(220px,300px)' }}>
          {panel}
          <ListaCompacta grupos={grupos} activo={sel.id} onAbrir={abrirProyecto} />
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-[22px]">
        {hayProyectos && <Totales totales={periodo.totales} alcance={alcance} />}
        <div className="px-4 md:hidden">
          <FilterTabs tabs={VISTAS} value={estado.vista} onChange={(v) => filtrar({ vista: v, proyecto: null })} />
        </div>
        {hayProyectos ? <ListaProyectos grupos={grupos} onAbrir={abrirProyecto} /> : <Vacio>Sin cuentas en este periodo con estos filtros.</Vacio>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[19px]">
      {/* Encabezado */}
      <div className="flex items-center gap-2 px-4 md:justify-between md:gap-3 md:px-0">
        <h1 className="sn-display min-w-0 flex-1 text-[27px] text-ink md:flex-none md:text-[22px]">Cuentas</h1>
        <div className="hidden items-center gap-2.5 md:flex">
          <Button variant="secondary" iconLeft="bell" onClick={() => abrir({ pantalla: 'avisos' })}>
            <span className="inline-flex items-center gap-1.5">
              Avisos
              <Contador n={avisos} />
            </span>
          </Button>
          <Button iconLeft="file-text" onClick={() => abrir({ pantalla: 'ordenes' })}>
            Orden de pago
          </Button>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            aria-label={`Avisos${avisos ? ` (${avisos})` : ''}`}
            onClick={() => abrir({ pantalla: 'avisos' })}
            className="relative flex h-9 w-9 items-center justify-center rounded-control border border-hairline bg-card text-body"
          >
            <Icon name="bell" size={18} />
            {avisos > 0 && (
              <span className="absolute -right-[5px] -top-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent px-[5px] text-[10.5px] font-semibold text-white">{avisos}</span>
            )}
          </button>
          <button type="button" aria-label="Órdenes de pago" onClick={() => abrir({ pantalla: 'ordenes' })} className="flex h-9 w-9 items-center justify-center rounded-control bg-accent text-white">
            <Icon name="file-text" size={18} />
          </button>
        </div>
      </div>

      {/* Periodo */}
      {periodo && (
        <div className="hidden md:block">
          <PeriodoEscritorio anio={anio} mes={mes} meses={periodo.meses} resumen={resumen} onMes={onMes} onAnio={onAnio} />
        </div>
      )}

      {/* Controles móviles: periodo, búsqueda y filtros */}
      <div className="flex flex-col gap-3.5 md:hidden">
        {buscando ? (
          <div className="flex items-center gap-3 px-4">
            <div className="min-w-0 flex-1">
              <SearchInput value={estado.q} onChange={(e) => filtrar({ q: e.target.value })} placeholder="Buscar proyecto, cliente o concepto" autoFocus />
            </div>
            <button
              type="button"
              className="text-[14px] text-accent"
              onClick={() => {
                setBuscando(false)
                filtrar({ q: '' })
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex gap-2 px-4">
            <BotonPeriodo anio={anio} mes={mes} pendientes={periodo?.conteo.pendientes ?? 0} onClick={() => abrir({ sheet: 'periodo' })} />
            <button type="button" aria-label="Buscar" onClick={() => setBuscando(true)} className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control border border-hairline bg-card text-body">
              <Icon name="search" size={18} />
            </button>
            <button
              type="button"
              aria-label="Filtros"
              onClick={() => abrir({ sheet: 'filtros' })}
              className={`relative flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control border bg-card text-body ${nFiltros ? 'border-accent-quiet' : 'border-hairline'}`}
            >
              <Icon name="sliders-horizontal" size={18} />
              {nFiltros > 0 && (
                <span className="absolute -right-[5px] -top-[5px] flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent px-[5px] text-[10.5px] font-semibold text-white">{nFiltros}</span>
              )}
            </button>
          </div>
        )}
        <Chips estado={estado} onCambio={cambiarFiltros} className="overflow-x-auto px-4 [scrollbar-width:none]" />
        {estado.vista === 'lista' && (
          <div className="px-4">
            <FilterTabs tabs={VISTAS} value={estado.vista} onChange={(v) => filtrar({ vista: v, proyecto: null })} />
          </div>
        )}
      </div>

      {/* Barra de vista (escritorio) */}
      <div className="hidden flex-wrap items-center gap-3 md:flex">
        <FilterTabs tabs={VISTAS} value={estado.vista} onChange={(v) => filtrar({ vista: v, proyecto: null })} />
        {periodo && (
          <FiltrosEscritorio estado={estado} conteo={periodo.conteo} clientes={periodo.opciones.clientes} proveedores={periodo.opciones.proveedores} mes={mes} onCambio={cambiarFiltros} />
        )}
        <Chips estado={estado} onCambio={cambiarFiltros} className="flex-wrap" />
        <div className="ml-auto">
          <SearchInput expandable value={estado.q} onChange={(e) => filtrar({ q: e.target.value })} placeholder="Buscar" />
        </div>
      </div>

      {error && (
        <div className="px-4 md:px-0">
          <StatusBanner tone="error">{error}</StatusBanner>
        </div>
      )}

      <div aria-busy={cargando} className={cargando && periodo ? 'opacity-70 transition-opacity' : ''}>
        {cuerpo()}
      </div>

      {/* Móvil: proyecto abierto en hoja al 92% */}
      {!escritorio && sel && (
        <BottomSheet
          height="92%"
          label={sel.nombre}
          onClose={() => cerrar({ proyecto: null, det: null })}
          header={
            <div className="flex-none border-b border-hairline px-4 pb-3.5 pt-2">
              <EncabezadoProyecto
                p={sel}
                acciones={
                  <button
                    type="button"
                    aria-label="Cerrar"
                    onClick={() => cerrar({ proyecto: null, det: null })}
                    className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-row-alt text-subtext"
                  >
                    <Icon name="close" size={16} />
                  </button>
                }
              />
            </div>
          }
        >
          <div className="grid grid-cols-1 content-start gap-4 px-4 pb-7 pt-3.5">
            <CuerpoProyecto p={sel} onAbrirConcepto={abrirConcepto} compacto />
          </div>
        </BottomSheet>
      )}

      {estado.sheet === 'periodo' && periodo && (
        <HojaPeriodo anio={anio} mes={mes} meses={periodo.meses} resumen={resumen} onMes={onMes} onAnio={onAnio} onClose={() => cerrar({ sheet: null })} />
      )}
      {estado.sheet === 'filtros' && periodo && (
        <HojaFiltros
          estado={estado}
          conteo={periodo.conteo}
          clientes={periodo.opciones.clientes}
          proveedores={periodo.opciones.proveedores}
          mes={mes}
          onCambio={cambiarFiltros}
          onClose={() => cerrar({ sheet: null })}
          resultados={resultadosFiltros}
        />
      )}

      {extras?.({ estado, abrir, cerrar, recargar, hoy: periodo?.hoy ?? resumen?.hoy ?? null })}
    </div>
  )
}
