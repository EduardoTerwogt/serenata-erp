'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Cotizacion, EstadoCotizacion } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
import { fetchQuotationsPage } from '@/lib/services/quotation-service'
import { SectionHero } from '@/components/ui/SectionHero'
import { SearchInput } from '@/components/ui/SearchInput'
import { FilterTabs, type FilterTab } from '@/components/ui/FilterTabs'
import { StatusBadge, toneForCotizacionEstado } from '@/components/ui/StatusBadge'
import { TableFooter } from '@/components/ui/TableFooter'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SectionLoading } from '@/components/ui/SectionLoading'

const ESTADOS: (EstadoCotizacion | 'TODAS')[] = ['TODAS', 'BORRADOR', 'EMITIDA', 'APROBADA', 'CANCELADA']
const PAGE_SIZE = 10
const SEARCH_DEBOUNCE_MS = 300

const ESTADO_LABEL: Record<EstadoCotizacion | 'TODAS', string> = {
  TODAS: 'Todas',
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  APROBADA: 'Aprobada',
  CANCELADA: 'Cancelada',
}

const EMPTY_COUNTS: Record<EstadoCotizacion | 'TODAS', number> = {
  TODAS: 0,
  BORRADOR: 0,
  EMITIDA: 0,
  APROBADA: 0,
  CANCELADA: 0,
}

function fmtMoney(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// EF-3 3B-4: busqueda/paginacion/conteos por estado server-side via
// fetchQuotationsPage (RPC buscar_cotizaciones) -- reemplaza el fetch
// directo propio que traía TODAS las cotizaciones y filtraba/paginaba en
// JS. Mismo mecanismo de debounce (300ms) + AbortController + numero de
// secuencia que useCuentasCobrar/useCuentasPagar (3B-2/3B-3): una
// respuesta solo se aplica al estado si su secuencia coincide con la
// última emitida.
export default function CotizacionesPage() {
  const router = useRouter()
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [countsByEstado, setCountsByEstado] = useState(EMPTY_COUNTS)
  const [filtro, setFiltro] = useState<EstadoCotizacion | 'TODAS'>('TODAS')
  const [busqueda, setBusquedaState] = useState('')
  const [busquedaDebounced, setBusquedaDebounced] = useState('')
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(1)

  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
  }, [])

  const cargar = useCallback(async (search: string, estado: EstadoCotizacion | 'TODAS', pageArg: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++seqRef.current

    setLoading(true)
    try {
      const data = await fetchQuotationsPage({
        search,
        estado: estado === 'TODAS' ? undefined : estado,
        page: pageArg,
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      })
      if (seq !== seqRef.current) return
      setCotizaciones(data.rows)
      setTotalRows(data.totalRows)
      setCountsByEstado({ ...EMPTY_COUNTS, ...data.countsByEstado })
    } catch {
      if (controller.signal.aborted || seq !== seqRef.current) return
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void cargar(busquedaDebounced, filtro, pagina) }, [cargar, busquedaDebounced, filtro, pagina])

  useEffect(() => {
    // Fase 5c: Prefetch de catálogos en background para Nueva Cotización
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      requestIdleCallback(() => {
        Promise.all([
          fetch('/api/clientes?q=').catch(() => {}),
          fetch('/api/productos?q=').catch(() => {}),
          fetch('/api/proveedores').catch(() => {}),
          fetch('/api/folio').catch(() => {}),
        ])
      })
    }
  }, [])

  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  const cambiarFiltro = (estado: EstadoCotizacion | 'TODAS') => {
    setFiltro(estado)
    setPagina(1)
  }

  const cambiarBusqueda = (valor: string) => {
    setBusquedaState(valor)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBusquedaDebounced(valor)
      setPagina(1)
    }, SEARCH_DEBOUNCE_MS)
  }

  const tabs: FilterTab<EstadoCotizacion | 'TODAS'>[] = useMemo(() => ESTADOS.map(estado => ({
    value: estado,
    label: ESTADO_LABEL[estado],
    count: countsByEstado[estado] ?? 0,
  })), [countsByEstado])

  return (
    <div className="flex flex-col gap-[19px]">
      <SectionHero
        title="Cotizaciones"
        action={
          <Button href="/cotizaciones/nueva" iconLeft="plus">
            Nueva cotización
          </Button>
        }
      />

      <div className="flex items-center gap-[13px] overflow-x-auto pb-0.5">
        <FilterTabs tabs={tabs} value={filtro} onChange={cambiarFiltro} />
        <div className="ml-auto flex-none">
          <SearchInput
            expandable
            placeholder="Buscar por folio, cliente, proyecto, item o responsable…"
            value={busqueda}
            onChange={e => cambiarBusqueda(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <SectionLoading />
      ) : cotizaciones.length > 0 ? (
        <div className="overflow-hidden rounded-panel border border-hairline bg-card">
          {/* Desktop: tabla -- table-fixed + colgroup para que los anchos de
              columna no cambien al paginar o filtrar (proporciones de
              CotizacionesScreen.jsx del kit: Folio 150px, Proyecto 1.5fr,
              Cliente/Total/Entrega 1fr, Estatus 124px). */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed text-[length:var(--text-md)]">
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr className="h-9">
                  {['Folio', 'Proyecto', 'Cliente', 'Total', 'Entrega', 'Estatus'].map(h => (
                    <th key={h} className="sn-table-head truncate px-[var(--row-pad-x)] text-left align-middle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cotizaciones.map(cot => (
                  <tr
                    key={cot.id}
                    onClick={() => router.push(`/cotizaciones/${cot.id}`)}
                    className="h-[46px] cursor-pointer border-b border-hairline last:border-0 odd:bg-row transition-colors duration-[var(--dur-fast)] hover:bg-row-alt"
                  >
                    <td className="truncate px-[var(--row-pad-x)] align-middle">
                      <span className="sn-display text-ink" style={{ letterSpacing: '0.06em' }}>{cot.id}</span>
                    </td>
                    <td className="px-[var(--row-pad-x)] align-middle">
                      <p className="truncate text-ink">{cot.proyecto}</p>
                      {cot.tipo === 'COMPLEMENTARIA' && (
                        <p className="mt-0.5 truncate text-[length:var(--text-xs)] text-accent">
                          Complementaria de <span className="font-mono font-semibold">{cot.es_complementaria_de}</span>
                        </p>
                      )}
                    </td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{cot.cliente}</td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle font-semibold text-ink">
                      {!cot.itemsCount ? (
                        <span className="inline-flex items-center gap-1 text-[length:var(--text-xs)] font-normal text-cancelled-fg">
                          <Icon name="warning" size={13} /> Sin items
                        </span>
                      ) : `$${fmtMoney(cot.total)}`}
                    </td>
                    <td className="truncate px-[var(--row-pad-x)] align-middle text-subtext">{formatDateDisplay(cot.fecha_entrega)}</td>
                    <td className="px-[var(--row-pad-x)] align-middle">
                      <StatusBadge tone={toneForCotizacionEstado(cot.estado)}>{cot.estado}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards -- el kit no cubre mobile, se mantiene el patrón ya usado en el resto de la app */}
          <div className="divide-y divide-hairline md:hidden">
            {cotizaciones.map(cot => (
              <Link key={cot.id} href={`/cotizaciones/${cot.id}`} className="block p-4 transition-colors hover:bg-row">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="sn-display truncate text-content text-body" style={{ letterSpacing: '0.06em' }}>{cot.id}</span>
                  <StatusBadge tone={toneForCotizacionEstado(cot.estado)} className="flex-shrink-0">{cot.estado}</StatusBadge>
                </div>
                <p className="mb-1 break-words text-[15px] font-medium text-body">{cot.proyecto}</p>
                <p className="mb-3 break-words text-content text-subtext">{cot.cliente}</p>
                {cot.tipo === 'COMPLEMENTARIA' && (
                  <p className="mb-2 break-words text-xs text-accent">
                    Complementaria de <span className="font-mono font-bold">{cot.es_complementaria_de}</span>
                  </p>
                )}
                {!cot.itemsCount && (
                  <p className="mb-2 flex items-center gap-1 break-words text-xs text-cancelled-fg">
                    <Icon name="warning" size={13} /> Sin items (llenar manualmente)
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="break-words text-lg font-bold text-body">${fmtMoney(cot.total)}</span>
                  <span className="flex-shrink-0 text-right text-xs text-faint">{formatDateDisplay(cot.fecha_entrega)}</span>
                </div>
              </Link>
            ))}
          </div>

          <TableFooter
            shown={cotizaciones.length}
            total={totalRows}
            unit="cotizaciones"
            page={pagina}
            pageCount={pageCount}
            onPageChange={setPagina}
          />
        </div>
      ) : (
        <div className="rounded-panel border border-hairline bg-card p-12 text-center">
          <p className="mb-2 text-lg text-subtext">
            {filtro === 'TODAS' ? 'No hay cotizaciones aún' : `No hay cotizaciones en estado ${ESTADO_LABEL[filtro]}`}
          </p>
          {filtro === 'TODAS' && (
            <>
              <p className="mb-6 text-content text-faint">Crea tu primera cotización para empezar</p>
              <Button href="/cotizaciones/nueva" iconLeft="plus">
                Nueva cotización
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
