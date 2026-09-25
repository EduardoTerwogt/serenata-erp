'use client'

import { useState } from 'react'
import { FilterTabs } from '@/components/ui/FilterTabs'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StatusBanner } from '@/components/ui/StatusBanner'
import { fmtMoney } from '@/lib/quotations/format'
import type { DetalleConcepto as Detalle } from '@/lib/shared/cuentas/detalle-tipos'
import { nombreCobro } from '@/lib/shared/cuentas/concepto'
import { TONO, useEsAdmin } from '../ui'
import { TabDocumentos } from './TabDocumentos'
import { TabInformacion } from './TabInformacion'
import { TabPago } from './TabPago'
import { accionesDetalle, useDetalle } from './useDetalle'

export type PestanaDetalle = 'info' | 'docs' | 'pago'

interface Props {
  conceptoKey: string
  tab: PestanaDetalle
  onTab: (t: PestanaDetalle) => void
  onClose: () => void
  /** Después de registrar algo: la lista y los totales se vuelven a pedir. */
  onCambio: () => void
  /** Fecha de negocio (CDMX). */
  hoy: string
}

function titulo(d: Detalle) {
  return d.tipo === 'cobro' ? d.cliente : d.responsable.nombre
}

function eyebrow(d: Detalle) {
  const folio = d.proyecto?.id ?? d.cotizacion_id ?? ''
  return `${d.tipo === 'cobro' ? 'Cuenta por cobrar' : 'Cuenta por pagar'}${folio ? ` · ${folio}` : ''}`
}

function concepto(d: Detalle) {
  if (d.tipo === 'cobro') return nombreCobro(d.cotizacion_id, d.proyecto?.id ?? null)
  return d.items.length === 1 ? d.items[0].descripcion : `${d.items.length} conceptos`
}

/**
 * Detalle del concepto (B5): modal de 780px en escritorio y hoja al 88% en
 * móvil, con avance y siguiente paso. Pagos a proveedor en total a
 * transferir (D18).
 */
export function DetalleConcepto({ conceptoKey, tab, onTab, onClose, onCambio, hoy }: Props) {
  const { objetivo, detalle: d, error, cargando, recargar } = useDetalle(conceptoKey)
  const esAdmin = useEsAdmin()
  // B7 (D5): las correcciones solo aparecen para admin con las cuentas reabiertas.
  const corrige = Boolean(esAdmin && d?.correcciones.reabierta)
  const [aviso, setAviso] = useState<{ tono: 'success' | 'error'; texto: string } | null>(null)

  const tras = async (accion: () => Promise<unknown>, exito: string) => {
    setAviso(null)
    try {
      await accion()
      setAviso({ tono: 'success', texto: exito })
      recargar()
      onCambio()
    } catch (err) {
      setAviso({ tono: 'error', texto: err instanceof Error ? err.message : 'No se pudo completar la acción' })
      recargar()
    }
  }

  const avisarError = (texto: string) => setAviso({ tono: 'error', texto })

  const c = d?.concepto
  const pct = d && d.total > 0 ? Math.min(100, Math.round((d.pagado / d.total) * 100)) : 0
  const saldo = d ? Math.max(0, Math.round((d.total - d.pagado) * 100) / 100) : 0
  const pestanas: { value: PestanaDetalle; label: string }[] = [
    { value: 'info', label: 'Información' },
    { value: 'docs', label: 'Documentos' },
    { value: 'pago', label: 'Registrar pago' },
  ]

  const encabezado = d && c && (
    <div className="flex flex-col gap-2 md:gap-2.5">
      <div className="flex flex-wrap items-center gap-2 md:gap-2.5">
        <StatusBadge tone={TONO[c.tono]}>{c.etiqueta}</StatusBadge>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink md:flex-none md:text-[14px] md:font-semibold">{concepto(d)}</span>
        <span className="hidden text-[12.5px] text-subtext md:inline">{d.proyecto?.nombre}</span>
        <span className="ml-auto hidden whitespace-nowrap text-[13.5px] font-semibold text-ink md:inline">
          {fmtMoney(d.pagado)} / {fmtMoney(d.total)}
        </span>
      </div>
      <div className="flex justify-between gap-2.5 text-[12px] md:hidden">
        <span className="text-subtext">{d.proyecto?.nombre}</span>
        <span className="whitespace-nowrap font-semibold text-ink">
          {fmtMoney(d.pagado)} / {fmtMoney(d.total)}
        </span>
      </div>
      <ProgressBar value={pct} tone={pct >= 100 ? 'approved' : 'accent'} label={`${pct}% ${d.tipo === 'cobro' ? 'cobrado' : 'pagado'}`} />
      <div className="flex justify-between gap-3 text-[11px] text-subtext md:text-[11.5px]">
        <span>
          {pct}% {d.tipo === 'cobro' ? 'cobrado' : 'pagado'}
          <span className="hidden md:inline"> · {c.paso_etiqueta ? `Siguiente paso: ${c.paso_etiqueta}` : 'Cuenta saldada'}</span>
        </span>
        <span>{saldo > 0 ? `Saldo ${fmtMoney(saldo)}` : 'Sin saldo pendiente'}</span>
      </div>
      <div className="flex items-center gap-2 rounded-control bg-row-alt px-2.5 py-2 text-[12px] md:hidden">
        <Icon name="arrow-right-circle" size={14} className="text-subtext" />
        <span className="min-w-0 flex-1 font-medium text-ink">{c.paso_etiqueta ? `Siguiente paso: ${c.paso_etiqueta}` : 'Cuenta saldada'}</span>
        {c.vencimiento && <span className={`whitespace-nowrap ${c.vencimiento.vencido ? 'text-cancelled-fg' : 'text-subtext'}`}>{c.vencimiento.texto}</span>}
      </div>
      <div className="mt-1 flex md:mt-1.5">
        <FilterTabs
          tabs={pestanas}
          value={tab}
          onChange={(t) => {
            setAviso(null)
            onTab(t)
          }}
        />
      </div>
    </div>
  )

  return (
    <Modal
      title={d ? titulo(d) : 'Cargando…'}
      eyebrow={d ? eyebrow(d) : undefined}
      size="780"
      mobile="sheet"
      sheetHeight="88%"
      closeOnEscape
      header={encabezado || undefined}
      bodyClassName="flex flex-col gap-5 [&>*]:shrink-0 px-4 pb-7 pt-4 md:px-[22px] md:pb-6 md:pt-[18px]"
      onClose={onClose}
    >
      {aviso && <StatusBanner tone={aviso.tono}>{aviso.texto}</StatusBanner>}
      {error && !d && <StatusBanner tone="error">{error}</StatusBanner>}
      {!d && cargando && <SectionLoading className="min-h-[240px]" />}
      {corrige && (
        <StatusBanner tone="info" className="text-[12.5px]">Cuentas reabiertas: puedes anular pagos, quitar o reemplazar documentos y corregir datos. Cada cambio queda registrado.</StatusBanner>
      )}
      {d && objetivo && tab === 'info' && (
        <TabInformacion d={d} ejecutar={tras} corrige={corrige} onReasignar={(itemId, id, nombre) => tras(() => accionesDetalle.reasignar(itemId, id, nombre), 'Proveedor reasignado')} />
      )}
      {d && objetivo && tab === 'docs' && <TabDocumentos d={d} objetivo={objetivo} ejecutar={tras} avisarError={avisarError} corrige={corrige} />}
      {d && objetivo && tab === 'pago' && <TabPago d={d} objetivo={objetivo} ejecutar={tras} avisarError={avisarError} irA={onTab} hoy={hoy} corrige={corrige} />}
    </Modal>
  )
}
