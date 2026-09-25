'use client'

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import type { ConceptoVista, ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { TablaConceptos } from './Conceptos'
import { fechaCorta, plural } from './formato'
import { chipProyecto } from './ui'

interface ProyectoPanelProps {
  p: ProyectoDetalle
  onAbrirConcepto: (c: ConceptoVista) => void
  /** Acciones del encabezado (Reabrir / Volver a cerrar, B7). */
  acciones?: ReactNode
}

function Metricas({ p, compacto }: { p: ProyectoDetalle; compacto?: boolean }) {
  const cerradas = p.cuentas.cerradas
  const items = [
    cerradas ? { k: 'Ingreso', v: p.totales.cobros_total, acento: false } : { k: 'Por cobrar', v: p.totales.por_cobrar, acento: true },
    cerradas ? { k: 'Egreso', v: p.totales.pagos_total, acento: false } : { k: 'Por pagar', v: p.totales.por_pagar, acento: false },
    { k: 'Utilidad bruta', v: p.cierre.utilidad_bruta, acento: false },
  ]
  return (
    <div className={compacto ? 'grid grid-cols-3 gap-2' : 'grid gap-3'} style={compacto ? undefined : { gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {items.map((m) => (
        <div key={m.k} className={`min-w-0 rounded-[10px] bg-row-alt ${compacto ? 'p-2.5' : 'px-3.5 py-3'}`}>
          <div className={`text-subtext ${compacto ? 'text-[10.5px]' : 'text-[11px]'}`}>{m.k}</div>
          <div className={`truncate whitespace-nowrap font-bold ${compacto ? 'mt-0.5 text-[13.5px]' : 'mt-[3px] text-[17px]'} ${m.acento ? 'text-accent' : 'text-ink'}`}>
            {fmtMoney(m.v)}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Cierre del proyecto (estimado): una fila por mes con su fecha SAT (D26) y el resumen de utilidad. */
function Cierre({ p }: { p: ProyectoDetalle }) {
  const c = p.cierre
  const filas = p.cierre_mensual
  return (
    <section aria-label="Cierre del proyecto" className="flex flex-col gap-2.5">
      <div className="sn-caption">Cierre del proyecto (estimado)</div>
      <div className="grid items-start gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
        {filas.length > 0 ? (
          <div className="min-w-0 overflow-hidden rounded-[10px] border border-hairline">
            <div className="hidden h-[34px] items-center justify-between bg-row-alt px-4 md:flex">
              <span className="sn-caption">Quién</span>
              <span className="sn-caption">Cuánto</span>
            </div>
            {filas.map((f, i) => (
              <div
                key={`${f.concepto}-${f.mes ?? 'pend'}-${i}`}
                className={`flex min-h-[50px] items-center gap-3 px-3.5 py-1.5 text-[12.5px] md:px-4 ${i > 0 ? 'border-t' : 'md:border-t'} border-hairline ${i % 2 ? 'md:bg-row-alt' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${f.a_favor ? 'text-approved-fg' : 'text-ink'}`}>{f.quien}</span>
                  <span className="mt-px block text-[10.5px] text-subtext md:text-[10.5px]">{f.sub}</span>
                </span>
                <span className="whitespace-nowrap text-right font-semibold text-ink">{fmtMoney(f.monto)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-hairline p-4 text-[12.5px] text-faint">Sin proveedores ni impuestos por enterar todavía</div>
        )}
        <div className="flex min-w-0 flex-col rounded-[10px] bg-row-alt px-3.5 py-2.5 text-[12.5px] text-body md:border md:border-hairline md:px-4 md:py-3">
          <div className="flex justify-between gap-3 py-1">
            <span>Utilidad bruta</span>
            <span className="whitespace-nowrap">{fmtMoney(c.utilidad_bruta)}</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-hairline pb-2.5 pt-1">
            <span>ISR estimado de Serenata (30%)</span>
            <span className="whitespace-nowrap">{fmtMoney(-c.isr_serenata_estimado)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5 md:border-b md:border-hairline">
            <span className="font-semibold text-ink">Utilidad neta (estimada)</span>
            <span className="whitespace-nowrap text-[17px] font-bold text-ink">{fmtMoney(c.utilidad_neta)}</span>
          </div>
          <div className="hidden justify-between gap-3 pb-1 pt-2.5 text-subtext md:flex">
            <span>IVA neto a enterar (informativo)</span>
            <span className="whitespace-nowrap">{fmtMoney(c.iva_neto_a_enterar)}</span>
          </div>
          <div className="hidden justify-between gap-3 py-1 text-subtext md:flex">
            <span>Retenciones a enterar por proveedores (informativo)</span>
            <span className="whitespace-nowrap">{fmtMoney(c.iva_retenido_total + c.isr_retenido_total)}</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] leading-[1.55] text-faint">
        Estimación, no el pago real: retenciones e IVA son dinero de terceros que se declara a más tardar el día 17 del mes siguiente al cobro o al pago; el ISR
        real de Serenata usa el coeficiente de utilidad del ejercicio anterior (Art. 14 LISR), no esta tasa plana.
      </p>
    </section>
  )
}

export function leyendaCierre(p: ProyectoDetalle): string {
  if (p.cuentas.cerradas) return `Cuentas cerradas automáticamente el ${fechaCorta(p.cuentas.fecha_cierre)}`
  if (p.cuentas.reabiertas && p.cuentas.pendientes === 0) return 'Cuentas reabiertas manualmente'
  return `${plural(p.cuentas.pendientes, 'concepto', 'conceptos')} por resolver`
}

function Aviso({ p }: { p: ProyectoDetalle }) {
  return (
    <div className="flex items-start gap-2 text-[12px] leading-[1.45] text-subtext">
      <Icon name="info" size={13} className="mt-0.5 flex-none" />
      <span>{leyendaCierre(p)}. Las cuentas se cierran solas cuando todo está cobrado, pagado y con documentos.</span>
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

/** Contenido del proyecto abierto; lo usan el panel de escritorio y la hoja móvil. */
export function CuerpoProyecto({ p, onAbrirConcepto, compacto, acciones }: ProyectoPanelProps & { compacto?: boolean }) {
  const cobros = p.conceptos.filter((c) => c.tipo === 'cobro')
  const pagos = p.conceptos.filter((c) => c.tipo === 'pago')
  return (
    <>
      <Metricas p={p} compacto={compacto} />
      <TablaConceptos tipo="cobro" conceptos={cobros} onAbrir={onAbrirConcepto} />
      <TablaConceptos tipo="pago" conceptos={pagos} onAbrir={onAbrirConcepto} />
      <Cierre p={p} />
      <Aviso p={p} />
      {compacto && acciones}
    </>
  )
}

/** Escritorio: tarjeta del proyecto seleccionado (maestro-detalle). */
export function ProyectoPanel({ p, onAbrirConcepto, acciones, onVolver }: ProyectoPanelProps & { onVolver?: () => void }) {
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
      <CuerpoProyecto p={p} onAbrirConcepto={onAbrirConcepto} />
    </article>
  )
}
