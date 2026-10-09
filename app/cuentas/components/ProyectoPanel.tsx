'use client'

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import { round2 } from '@/lib/shared/decimal'
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

function Linea({ k, v, fuerte, saldo }: { k: string; v: number; fuerte?: boolean; saldo?: boolean }) {
  return (
    <div className={`flex justify-between gap-2.5 text-[11.5px] leading-[1.4] ${saldo ? 'mt-1 border-t border-dashed border-hairline pt-1.5' : ''}`}>
      <span className={fuerte ? 'font-semibold text-ink' : 'text-subtext'}>{k}</span>
      <span className={`whitespace-nowrap ${fuerte ? 'font-semibold text-ink' : saldo ? 'font-semibold text-accent' : 'text-body'}`}>{fmtMoney(v)}</span>
    </div>
  )
}

/**
 * #99: cómo sale la utilidad bruta del flujo con IVA. El IVA y las
 * retenciones son de terceros, así que se restan del flujo; lo que no cuadre
 * (p. ej. el Total de un CFDI distinto del estimado) va en "Ajuste", nunca se esconde.
 */
function conciliacionUtilidad(p: ProyectoDetalle) {
  const c = p.cierre
  const flujo = round2(p.totales.cobros_total - p.totales.pagos_total)
  const retenciones = round2(c.iva_retenido_total + c.isr_retenido_total)
  const ajuste = round2(flujo - c.iva_neto_a_enterar - retenciones - c.utilidad_bruta)
  return { flujo, iva: c.iva_neto_a_enterar, retenciones, ajuste, bruta: c.utilidad_bruta }
}

function LineasConciliacion({ p }: { p: ProyectoDetalle }) {
  const u = conciliacionUtilidad(p)
  return (
    <>
      <Linea k="Flujo con IVA (cobro − pago)" v={u.flujo} />
      <Linea k="IVA neto a enterar" v={-u.iva} />
      <Linea k="Retenciones a enterar" v={-u.retenciones} />
      {u.ajuste !== 0 && <Linea k="Ajuste (factura real u otros)" v={-u.ajuste} />}
      <div className="mt-0.5 border-t border-hairline pt-1">
        <Linea k="Utilidad bruta" v={u.bruta} fuerte />
      </div>
    </>
  )
}

/** Ingreso y egreso antes y después de IVA, y la utilidad bruta conciliada con el flujo (#99). */
function Metricas({ p, compacto }: { p: ProyectoDetalle; compacto?: boolean }) {
  const t = p.totales
  const c = p.cierre
  const cerradas = p.cuentas.cerradas
  const retenciones = round2(c.iva_retenido_total + c.isr_retenido_total)

  if (compacto) {
    const items = [
      { k: 'Ingreso', v: t.cobros_sin_iva, s: `c/IVA ${fmtMoney(t.cobros_total)}`, acento: false },
      { k: 'Egreso', v: t.pagos_neto, s: `c/IVA ${fmtMoney(t.pagos_total)}`, acento: false },
      { k: 'Utilidad', v: c.utilidad_bruta, s: 'antes de ISR', acento: true },
    ]
    return (
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {items.map((m) => (
            <div key={m.k} className="min-w-0 rounded-[10px] bg-row-alt p-2.5">
              <div className="text-[10.5px] text-subtext">{m.k}</div>
              <div className={`mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold ${m.acento ? 'text-accent' : 'text-ink'}`}>{fmtMoney(m.v)}</div>
              <div className="truncate text-[10px] text-subtext">{m.s}</div>
            </div>
          ))}
        </div>
        <details className="rounded-[10px] bg-row-alt px-2.5 py-2">
          <summary className="cursor-pointer text-[11.5px] font-semibold text-ink">Cómo sale la utilidad</summary>
          <div className="mt-1.5 flex flex-col gap-px border-t border-hairline pt-1.5">
            <LineasConciliacion p={p} />
          </div>
        </details>
        {!cerradas && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="flex justify-between gap-2 rounded-[10px] bg-row-alt px-2.5 py-1.5">
              <span className="text-subtext">Por cobrar</span>
              <span className="whitespace-nowrap font-semibold text-accent">{fmtMoney(t.por_cobrar)}</span>
            </div>
            <div className="flex justify-between gap-2 rounded-[10px] bg-row-alt px-2.5 py-1.5">
              <span className="text-subtext">Por pagar</span>
              <span className="whitespace-nowrap font-semibold text-ink">{fmtMoney(t.por_pagar)}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  const par = (izq: { k: string; v: number }, der: { k: string; v: number }) => (
    <div className="mt-1.5 grid grid-cols-2 gap-2.5">
      {[izq, der].map((x, i) => (
        <div key={x.k} className="min-w-0">
          <div className="text-[10.5px] text-subtext">{x.k}</div>
          <div className={`mt-px truncate whitespace-nowrap text-[16px] ${i === 0 ? 'font-bold text-ink' : 'font-semibold text-body'}`}>{fmtMoney(x.v)}</div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
      <div className="flex min-w-0 flex-col rounded-[10px] bg-row-alt px-3.5 py-3">
        <div className="text-[11px] text-subtext">Ingreso · cobro al cliente</div>
        {par({ k: 'Antes de IVA', v: t.cobros_sin_iva }, { k: 'Con IVA', v: t.cobros_total })}
        <div className="mt-2 flex flex-col gap-px border-t border-hairline pt-1.5">
          <Linea k="IVA 16 % cobrado" v={round2(t.cobros_total - t.cobros_sin_iva)} />
          {!cerradas && <Linea k="Por cobrar (saldo)" v={t.por_cobrar} saldo />}
        </div>
      </div>
      <div className="flex min-w-0 flex-col rounded-[10px] bg-row-alt px-3.5 py-3">
        <div className="text-[11px] text-subtext">Egreso · pago a proveedores</div>
        {par({ k: 'Antes de IVA (neto)', v: t.pagos_neto }, { k: 'A transferir', v: t.pagos_total })}
        <div className="mt-2 flex flex-col gap-px border-t border-hairline pt-1.5">
          <Linea k="IVA 16 % de proveedores" v={c.iva_pagado} />
          {retenciones !== 0 && <Linea k="Retenciones (IVA + ISR)" v={-retenciones} />}
          {!cerradas && <Linea k="Por pagar (saldo)" v={t.por_pagar} saldo />}
        </div>
      </div>
      <div className="flex min-w-0 flex-col rounded-[10px] bg-row-alt px-3.5 py-3">
        <div className="text-[11px] text-subtext">Utilidad bruta (antes de ISR)</div>
        <div className="mt-[3px] truncate whitespace-nowrap text-[22px] font-bold text-accent">{fmtMoney(c.utilidad_bruta)}</div>
        {round2(t.cobros_sin_iva - t.pagos_neto) === c.utilidad_bruta && (
          <div className="truncate text-[10.5px] text-faint">
            {fmtMoney(t.cobros_sin_iva)} − {fmtMoney(t.pagos_neto)} antes de IVA
          </div>
        )}
        <div className="mt-2 flex flex-col gap-px border-t border-hairline pt-1.5">
          <LineasConciliacion p={p} />
        </div>
      </div>
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
  const pendientes = `${plural(p.cuentas.pendientes, 'concepto', 'conceptos')} por resolver`
  return p.cuentas.reabiertas ? `Cuentas reabiertas · ${pendientes}` : pendientes
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
