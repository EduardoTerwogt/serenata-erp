'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Cotizacion, EstadoCotizacion } from '@/lib/types'
import { formatDateDisplay } from '@/lib/format-date'
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

const ESTADO_LABEL: Record<EstadoCotizacion | 'TODAS', string> = {
  TODAS: 'Todas',
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  APROBADA: 'Aprobada',
  CANCELADA: 'Cancelada',
}

function fmtMoney(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CotizacionesPage() {
  const router = useRouter()
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [filtro, setFiltro] = useState<EstadoCotizacion | 'TODAS'>('TODAS')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    fetch('/api/cotizaciones')
      .then(r => r.json())
      .then(data => {
        setCotizaciones(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))

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

  const porEstado = filtro === 'TODAS'
    ? cotizaciones
    : cotizaciones.filter(c => c.estado === filtro)

  const filtradas = busqueda.trim()
    ? porEstado.filter(cot => {
        const term = busqueda.toLowerCase()
        return (
          cot.id.toLowerCase().includes(term) ||
          cot.cliente.toLowerCase().includes(term) ||
          cot.proyecto.toLowerCase().includes(term) ||
          (cot.items || []).some(item =>
            item.descripcion.toLowerCase().includes(term) ||
            (item.responsable_nombre && item.responsable_nombre.toLowerCase().includes(term))
          )
        )
      })
    : porEstado

  const pageCount = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))
  const paginaActual = Math.min(pagina, pageCount)
  const paginadas = filtradas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)

  const cambiarFiltro = (estado: EstadoCotizacion | 'TODAS') => {
    setFiltro(estado)
    setPagina(1)
  }

  const cambiarBusqueda = (valor: string) => {
    setBusqueda(valor)
    setPagina(1)
  }

  const tabs: FilterTab<EstadoCotizacion | 'TODAS'>[] = useMemo(() => ESTADOS.map(estado => ({
    value: estado,
    label: ESTADO_LABEL[estado],
    count: estado === 'TODAS' ? cotizaciones.length : cotizaciones.filter(c => c.estado === estado).length,
  })), [cotizaciones])

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
      ) : filtradas.length > 0 ? (
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
                {paginadas.map(cot => (
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
                      {(!cot.items || cot.items.length === 0) ? (
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
            {paginadas.map(cot => (
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
                {(!cot.items || cot.items.length === 0) && (
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
            shown={paginadas.length}
            total={filtradas.length}
            unit="cotizaciones"
            page={paginaActual}
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
