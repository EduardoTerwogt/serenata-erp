'use client'

import { useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { ListaRadio } from '@/components/ui/SearchableSelect'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { Select } from '@/components/ui/Select'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { TextField } from '@/components/ui/TextField'
import { fmtMoney } from '@/lib/quotations/format'
import { ETIQUETA_ESTADO_ORDEN, type EstadoOrden, type HistorialOrdenesRespuesta, type OrdenHistorial } from '@/lib/shared/cuentas/ordenes-tipos'
import { fechaCorta, plural } from '../formato'
import { TONO_ORDEN } from './PanelAvisosOrdenes'
import { accionesOrden, compartirEnlace, useHistorial, type FiltrosHistorial } from './useOrdenes'

const ESTADOS: EstadoOrden[] = ['GENERADA', 'PARCIALMENTE_PAGADA', 'COMPLETADA', 'VENCIDA', 'CANCELADA']
const PASO = 20
const MAX_PAGINA = 100

const nombreOrden = (o: OrdenHistorial) => (o.pdf_nombre ?? 'Orden de pago').replace(/\.pdf$/i, '')

function opcionesEstado(datos: HistorialOrdenesRespuesta | null) {
  return ESTADOS.map((e) => ({ value: e, label: ETIQUETA_ESTADO_ORDEN[e], count: datos?.conteos[e] ?? 0 }))
}

/** Detalle de una orden: desglose por proveedor (S1), descarga y cancelación (D7). */
function Desglose({ o, onCambio, movil }: { o: OrdenHistorial; onCambio: () => void; movil: boolean }) {
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancelable = (o.estado === 'GENERADA' || o.estado === 'VENCIDA') && o.pagado === 0

  const cancelar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await accionesOrden.cancelar(o.id, motivo)
      onCambio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cancelar la orden')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 bg-row-alt px-4 pb-3.5 pt-1.5">
      {o.desglose.map((d, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-hairline py-2 text-[12.5px] last:border-b-0">
          <span className="sn-folio text-[11px] text-accent">{d.proyecto_id ?? '—'}</span>
          <span className="min-w-0 flex-1 truncate text-ink">{d.responsable_nombre ?? 'Sin asignar'}</span>
          <span className="whitespace-nowrap text-ink">{fmtMoney(d.monto)}</span>
        </div>
      ))}
      {o.monto_estimado && <span className="text-[11px] text-subtext">Orden anterior al rediseño: montos netos guardados al generarla.</span>}
      {o.estado === 'CANCELADA' && o.cancelada_motivo && <span className="text-[11.5px] text-subtext">Cancelada: {o.cancelada_motivo}</span>}
      {error && <StatusBanner tone="error">{error}</StatusBanner>}
      {cancelando ? (
        <div className="flex flex-col gap-2">
          <TextField label="Motivo de la cancelación" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. el proveedor cambió de cuenta" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => setCancelando(false)}>
              Volver
            </Button>
            <Button size="md" onClick={cancelar} disabled={motivo.trim().length < 3 || enviando}>
              {enviando ? 'Cancelando…' : 'Confirmar cancelación'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          {cancelable && (
            <Button variant="ghost" size="md" onClick={() => setCancelando(true)}>
              Cancelar orden
            </Button>
          )}
          {o.pdf_url &&
            (movil ? (
              <button type="button" onClick={() => void compartirEnlace(o.pdf_url!, nombreOrden(o)).catch(() => undefined)} className="flex items-center gap-1.5 text-[13px] font-medium text-accent">
                <Icon name="share" size={15} />
                Compartir PDF
              </button>
            ) : null)}
          {o.pdf_url && (
            <a href={o.pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] font-medium text-accent">
              <Icon name="file-down" size={15} />
              Descargar PDF
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/** Móvil: historial dentro de la pantalla "Órdenes de pago", con filtro de estado en hoja y contadores. */
export function HistorialInline({ onOrdenCambio }: { onOrdenCambio?: () => void }) {
  const [estado, setEstado] = useState('')
  const [hoja, setHoja] = useState(false)
  const [tam, setTam] = useState(PASO)
  const [abierta, setAbierta] = useState<string | null>(null)
  const { datos, error, recargar } = useHistorial(true, { estado: estado || undefined }, tam)

  return (
    <section aria-label="Historial de órdenes" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="sn-caption">Historial de órdenes</span>
        <button type="button" onClick={() => setHoja(true)} className="flex h-9 items-center gap-2 rounded-control border border-hairline bg-card px-3 text-[14px] text-body">
          <Icon name="sliders-horizontal" size={15} />
          {estado ? ETIQUETA_ESTADO_ORDEN[estado as EstadoOrden] : 'Todas'}
          <Icon name="chevron-down" size={14} className="text-subtext" />
        </button>
      </div>
      {error && !datos && <StatusBanner tone="error">{error}</StatusBanner>}
      {!datos && !error && <SectionLoading className="min-h-[160px]" />}
      {datos && datos.rows.length === 0 && <div className="rounded-panel border border-hairline bg-card px-4 py-4 text-[13px] text-faint">Sin órdenes con este filtro.</div>}
      {datos && datos.rows.length > 0 && (
        <div className="overflow-hidden rounded-panel border border-hairline bg-card">
          {datos.rows.map((o) => (
            <div key={o.id} className="border-t border-hairline first:border-t-0">
              <button type="button" aria-expanded={abierta === o.id} onClick={() => setAbierta(abierta === o.id ? null : o.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium text-ink">{nombreOrden(o)}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge tone={TONO_ORDEN[o.estado]} className="!h-5 text-[10.5px]">
                      {ETIQUETA_ESTADO_ORDEN[o.estado]}
                    </StatusBadge>
                    <span className="whitespace-nowrap text-[12px] text-subtext">
                      {fechaCorta(o.fecha_generacion)} · {plural(o.cuentas, 'cuenta', 'cuentas')}
                    </span>
                  </div>
                </div>
                <span className="whitespace-nowrap text-[15px] font-semibold text-ink">{fmtMoney(o.monto)}</span>
                <Icon name={abierta === o.id ? 'chevron-down' : 'chevron-right'} size={16} className="text-subtext" />
              </button>
              {abierta === o.id && <Desglose o={o} movil onCambio={() => (recargar(), onOrdenCambio?.())} />}
            </div>
          ))}
        </div>
      )}
      {datos && datos.total_rows > datos.rows.length && tam < MAX_PAGINA && (
        <Button variant="secondary" fullWidth onClick={() => setTam((t) => Math.min(MAX_PAGINA, t + PASO))}>
          Ver más
        </Button>
      )}
      {hoja && (
        <BottomSheet title="Estado de la orden" label="Estado de la orden" onClose={() => setHoja(false)}>
          <div className="px-3 pb-6">
            <ListaRadio
              opciones={opcionesEstado(datos)}
              value={estado}
              todos="Todas"
              marca="check"
              onChange={(v) => {
                setEstado(v)
                setTam(PASO)
                setHoja(false)
              }}
            />
          </div>
        </BottomSheet>
      )}
    </section>
  )
}

/** Escritorio: historial completo en modal de 960px con filtros y búsqueda por folio (B6). */
export function HistorialModal({ onClose, onOrdenCambio }: { onClose: () => void; onOrdenCambio?: () => void }) {
  const [filtros, setFiltros] = useState<FiltrosHistorial>({})
  const [panel, setPanel] = useState(false)
  const [tam, setTam] = useState(PASO)
  const [abierta, setAbierta] = useState<string | null>(null)
  const { datos, error, cargando, recargar } = useHistorial(true, filtros, tam)
  const cambiar = (c: Partial<FiltrosHistorial>) => {
    setFiltros((f) => ({ ...f, ...c }))
    setTam(PASO)
  }
  const nFiltros = [filtros.estado, filtros.mes, filtros.proveedor, filtros.proyecto].filter(Boolean).length
  const cols = 'grid grid-cols-[28px_minmax(0,2.2fr)_minmax(0,1.6fr)_110px_120px_28px] items-center gap-x-3'

  return (
    <Modal title="Historial de órdenes" eyebrow="Órdenes de pago" size="960" closeOnEscape onClose={onClose} bodyClassName="flex flex-col gap-4 [&>*]:shrink-0 px-[22px] pb-6 pt-5">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="md" iconLeft="sliders-horizontal" iconRight="chevron-down" onClick={() => setPanel((p) => !p)}>
          {nFiltros ? `Filtros · ${nFiltros}` : 'Filtros'}
        </Button>
        <div className="w-[240px]">
          <SearchInput value={filtros.q ?? ''} onChange={(e) => cambiar({ q: e.target.value })} placeholder="Buscar por folio" />
        </div>
      </div>
      {panel && (
        <div className="grid grid-cols-4 gap-3 rounded-panel border border-hairline bg-row p-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="sn-label">Estado</span>
            <Select value={filtros.estado ?? ''} onChange={(e) => cambiar({ estado: e.target.value || undefined })} className="w-full">
              <option value="">Todos</option>
              {opcionesEstado(datos).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.count})
                </option>
              ))}
            </Select>
          </label>
          <TextField label="Mes" type="month" value={filtros.mes ?? ''} onChange={(e) => cambiar({ mes: e.target.value || undefined })} />
          <TextField label="Proveedor" value={filtros.proveedor ?? ''} onChange={(e) => cambiar({ proveedor: e.target.value || undefined })} placeholder="Nombre exacto" />
          <TextField label="Proyecto" value={filtros.proyecto ?? ''} onChange={(e) => cambiar({ proyecto: e.target.value.toUpperCase() || undefined })} placeholder="SH061" />
        </div>
      )}
      {error && !datos && <StatusBanner tone="error">{error}</StatusBanner>}
      <div className={`overflow-hidden rounded-panel border border-hairline ${cargando && datos ? 'opacity-70' : ''}`}>
        <div className={`${cols} h-9 bg-row-alt px-4 text-[10.5px] font-semibold tracking-[0.04em] text-subtext`}>
          <span />
          <span>ORDEN</span>
          <span>PROYECTOS</span>
          <span className="text-center">ESTADO</span>
          <span className="text-right">MONTO</span>
          <span />
        </div>
        {!datos && !error && <SectionLoading className="min-h-[200px]" />}
        {datos?.rows.map((o) => (
          <div key={o.id} className="border-t border-hairline">
            <div
              role="button"
              tabIndex={0}
              aria-expanded={abierta === o.id}
              onClick={() => setAbierta(abierta === o.id ? null : o.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setAbierta(abierta === o.id ? null : o.id)
                }
              }}
              className={`${cols} min-h-[49px] cursor-pointer px-4 py-1.5 hover:bg-row-alt`}
            >
              <Icon name={abierta === o.id ? 'chevron-down' : 'chevron-right'} size={15} className="text-subtext" />
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-medium text-ink">{nombreOrden(o)}</div>
                <div className="text-[11.5px] text-subtext">
                  {fechaCorta(o.fecha_generacion)} · {plural(o.cuentas, 'cuenta', 'cuentas')}
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {o.proyectos.map((p) => (
                  <span key={p} className="sn-folio rounded-[5px] border border-hairline bg-row-alt px-1.5 py-0.5 text-[10.5px] text-accent">
                    {p}
                  </span>
                ))}
              </div>
              <span className="flex justify-center">
                <StatusBadge tone={TONO_ORDEN[o.estado]} className="!h-5 text-[10.5px]">
                  {ETIQUETA_ESTADO_ORDEN[o.estado]}
                </StatusBadge>
              </span>
              <span className="whitespace-nowrap text-right text-[13.5px] font-semibold text-ink">{fmtMoney(o.monto)}</span>
              {o.pdf_url ? (
                <a href={o.pdf_url} target="_blank" rel="noreferrer" aria-label={`Descargar ${nombreOrden(o)}`} onClick={(e) => e.stopPropagation()} className="text-subtext hover:text-body">
                  <Icon name="file-down" size={16} />
                </a>
              ) : (
                <span />
              )}
            </div>
            {abierta === o.id && <Desglose o={o} movil={false} onCambio={() => (recargar(), onOrdenCambio?.())} />}
          </div>
        ))}
        {datos && datos.rows.length === 0 && <div className="border-t border-hairline px-4 py-4 text-[13px] text-faint">Sin órdenes con estos filtros.</div>}
        {datos && (
          <div className="flex items-center justify-between border-t border-hairline px-4 py-3 text-[12px] text-subtext">
            <span>
              Mostrando {datos.rows.length} de {plural(datos.total_rows, 'orden', 'órdenes')}
            </span>
            {datos.total_rows > datos.rows.length && tam < MAX_PAGINA && (
              <Button variant="ghost" size="md" onClick={() => setTam((t) => Math.min(MAX_PAGINA, t + PASO))}>
                Ver más
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
