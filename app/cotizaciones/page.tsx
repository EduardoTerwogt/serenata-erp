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
import { Icon } from '@/components/ui/Icon'

const ESTADOS: (EstadoCotizacion | 'TODAS')[] = ['TODAS', 'BORRADOR', 'EMITIDA', 'APROBADA', 'CANCELADA']

function fmtMoney(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CotizacionesPage() {
  const router = useRouter()
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [filtro, setFiltro] = useState<EstadoCotizacion | 'TODAS'>('TODAS')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)

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
          fetch('/api/responsables').catch(() => {}),
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

  const tabs: FilterTab<EstadoCotizacion | 'TODAS'>[] = useMemo(() => ESTADOS.map(estado => ({
    value: estado,
    label: estado,
    count: estado === 'TODAS' ? cotizaciones.length : cotizaciones.filter(c => c.estado === estado).length,
  })), [cotizaciones])

  return (
    <div className="flex flex-col gap-[19px]">
      <SectionHero
        title="Cotizaciones"
        subtitle="Gestiona todas tus cotizaciones"
        action={
          <Link
            href="/cotizaciones/nueva"
            className="flex h-[var(--control-height-lg)] items-center justify-center gap-2 rounded-control bg-accent px-[26px] text-[length:var(--text-md)] font-bold tracking-[0.01em] text-accent-ink transition-colors hover:bg-accent-pressed"
          >
            <Icon name="plus" size={15} />
            Nueva Cotización
          </Link>
        }
      />

      <SearchInput
        placeholder="Buscar por folio, cliente, proyecto, item o responsable..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      <FilterTabs tabs={tabs} value={filtro} onChange={setFiltro} />

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-card border border-hairline bg-card p-4 md:p-6">
              <div className="hidden md:flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-5 w-20 rounded bg-row" />
                  <div className="space-y-1">
                    <div className="h-4 w-40 rounded bg-row" />
                    <div className="h-3 w-28 rounded bg-row" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="h-5 w-24 rounded bg-row" />
                  <div className="h-6 w-20 rounded-full bg-row" />
                </div>
              </div>
              <div className="md:hidden space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 w-24 rounded bg-row" />
                  <div className="h-4 w-16 rounded-full bg-row" />
                </div>
                <div className="h-4 w-3/4 rounded bg-row" />
                <div className="h-3 w-1/2 rounded bg-row" />
              </div>
            </div>
          ))}
        </div>
      ) : filtradas.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-hairline bg-card">
          {/* Desktop: tabla */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-content">
              <thead>
                <tr className="border-b border-hairline">
                  {['Folio', 'Proyecto', 'Cliente', 'Total', 'Entrega', 'Estatus'].map(h => (
                    <th key={h} className="sn-label whitespace-nowrap px-6 py-3 text-left font-semibold" style={{ fontSize: 'var(--text-table-head)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map(cot => (
                  <tr
                    key={cot.id}
                    onClick={() => router.push(`/cotizaciones/${cot.id}`)}
                    className="cursor-pointer border-b border-hairline last:border-0 transition-colors hover:bg-row"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="sn-display text-body" style={{ letterSpacing: '0.06em' }}>{cot.id}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-body">{cot.proyecto}</p>
                      {cot.tipo === 'COMPLEMENTARIA' && (
                        <p className="mt-0.5 text-xs text-accent">
                          Complementaria de <span className="font-mono font-bold">{cot.es_complementaria_de}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-subtext">{cot.cliente}</td>
                    <td className="whitespace-nowrap px-6 py-4 font-semibold text-body">
                      {(!cot.items || cot.items.length === 0) ? (
                        <span className="inline-flex items-center gap-1 text-xs font-normal text-cancelled-fg">
                          <Icon name="warning" size={13} /> Sin items
                        </span>
                      ) : `$${fmtMoney(cot.total)}`}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-subtext">{formatDateDisplay(cot.fecha_entrega)}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge tone={toneForCotizacionEstado(cot.estado)}>{cot.estado}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards -- el kit no cubre mobile, se mantiene el patrón ya usado en el resto de la app */}
          <div className="divide-y divide-hairline md:hidden">
            {filtradas.map(cot => (
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
        </div>
      ) : (
        <div className="rounded-card border border-hairline bg-card p-12 text-center">
          <p className="mb-2 text-lg text-subtext">
            {filtro === 'TODAS' ? 'No hay cotizaciones aún' : `No hay cotizaciones en estado ${filtro}`}
          </p>
          {filtro === 'TODAS' && (
            <>
              <p className="mb-6 text-content text-faint">Crea tu primera cotización para empezar</p>
              <Link
                href="/cotizaciones/nueva"
                className="inline-flex h-[var(--control-height-lg)] items-center gap-2 rounded-control bg-accent px-[26px] text-[length:var(--text-md)] font-bold tracking-[0.01em] text-accent-ink transition-colors hover:bg-accent-pressed"
              >
                <Icon name="plus" size={15} />
                Nueva Cotización
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
