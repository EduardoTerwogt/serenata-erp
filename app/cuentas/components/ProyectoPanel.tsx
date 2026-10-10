'use client'

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { ConceptoVista, ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { TablaConceptos } from './Conceptos'
import { fechaCorta } from './formato'
import { ProyectoResumen } from './ProyectoResumen'
import { chipProyecto } from './ui'

interface ProyectoPanelProps {
  p: ProyectoDetalle
  /** Botón «Siguiente paso» de cada concepto (#140); ausente en proyectos históricos. */
  onAccion?: (c: ConceptoVista) => void
  /** Fecha de negocio (`periodo.hoy`): decide si el mes del IVA ya cerró. */
  hoy: string
  onAbrirConcepto: (c: ConceptoVista) => void
  /** Acciones del encabezado (Reabrir / Volver a cerrar, B7). */
  acciones?: ReactNode
}

/** Cierre del proyecto; el conteo de pendientes ya lo dice el chip del encabezado. */
export function leyendaCierre(p: ProyectoDetalle): string {
  if (p.cuentas.cerradas) return `Cuentas cerradas automáticamente el ${fechaCorta(p.cuentas.fecha_cierre)}`
  if (p.cuentas.reabiertas) return 'Cuentas reabiertas'
  return ''
}

function Aviso({ p }: { p: ProyectoDetalle }) {
  if (p.historico) {
    return (
      <div className="flex items-start gap-2 text-[12px] leading-[1.45] text-subtext">
        <Icon name="lock" size={13} className="mt-0.5 flex-none" />
        <span>Proyecto histórico: solo consulta. Pasó a histórico tras 190 días sin cambios con todo cobrado, pagado y con documentos; ya no admite cambios.</span>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 text-[12px] leading-[1.45] text-subtext">
      <Icon name="info" size={13} className="mt-0.5 flex-none" />
      <span>
        {leyendaCierre(p) && `${leyendaCierre(p)}. `}Las cuentas se cierran solas cuando todo está cobrado, pagado y con documentos.
      </span>
    </div>
  )
}

const eventoDe = (p: ProyectoDetalle) => (p.sin_proyecto ? 'Sin proyecto' : p.fecha_entrega ? `Evento ${fechaCorta(p.fecha_entrega)}` : 'Sin fecha de evento')

/** Encabezado del proyecto: folio, chip, nombre y "cliente · evento". */
export function EncabezadoProyecto({ p, acciones, antes }: { p: ProyectoDetalle; acciones?: ReactNode; antes?: ReactNode }) {
  const chip = chipProyecto(p)
  return (
    <div className="flex items-start gap-3.5">
      {antes}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          {!p.sin_proyecto && <span className="sn-folio text-[12px]">{p.id}</span>}
          <StatusBadge tone={chip.tone}>{chip.label}</StatusBadge>
        </div>
        <h2 className="mt-1.5 text-[19px] font-bold text-ink">{p.nombre}</h2>
        <div className="mt-[3px] text-[12.5px] text-subtext">
          {p.cliente ? `${p.cliente} · ` : ''}
          {eventoDe(p)}
        </div>
      </div>
      {acciones}
    </div>
  )
}

/** Contenido del proyecto abierto; lo usan el panel de escritorio y la hoja móvil (que pasa `pie` con las acciones de reapertura). */
export function CuerpoProyecto({ p, hoy, onAbrirConcepto, onAccion, pie }: Omit<ProyectoPanelProps, 'acciones'> & { pie?: ReactNode }) {
  const cobros = p.conceptos.filter((c) => c.tipo === 'cobro')
  const pagos = p.conceptos.filter((c) => c.tipo === 'pago')
  return (
    <>
      <ProyectoResumen p={p} hoy={hoy} />
      <TablaConceptos tipo="cobro" conceptos={cobros} onAbrir={onAbrirConcepto} onAccion={p.historico ? undefined : onAccion} />
      <TablaConceptos tipo="pago" conceptos={pagos} onAbrir={onAbrirConcepto} onAccion={p.historico ? undefined : onAccion} />
      <Aviso p={p} />
      {pie}
    </>
  )
}

/** Escritorio: tarjeta del proyecto seleccionado (maestro-detalle). */
export function ProyectoPanel({ p, hoy, onAbrirConcepto, onAccion, acciones, onVolver }: ProyectoPanelProps & { onVolver?: () => void }) {
  return (
    <article className="flex min-w-0 flex-col gap-[18px] overflow-hidden rounded-panel border border-hairline bg-card px-[22px] py-5 shadow-card">
      <EncabezadoProyecto
        p={p}
        acciones={acciones}
        antes={
          onVolver && (
            <button type="button" onClick={onVolver} aria-label="Volver a la lista de proyectos" className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-control border border-hairline text-subtext hover:text-body">
              <Icon name="chevron-left" size={16} />
            </button>
          )
        }
      />
      <CuerpoProyecto p={p} hoy={hoy} onAbrirConcepto={onAbrirConcepto} onAccion={onAccion} />
    </article>
  )
}
