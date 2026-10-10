'use client'

import type { ReactNode } from 'react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import { round2 } from '@/lib/shared/decimal'
import type { ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { fechaCorta } from './formato'
import { montoAprox, resumenProyecto } from './resumen-proyecto'

const REGIMEN = { moral: 'Moral', fisica: 'Física honorarios', resico: 'RESICO' } as const

/** Barra de partes (cada una con su color de token): el ancho es la parte del total, sin pasar de 100 %. */
function Barra({ partes, label }: { partes: { v: number; color: string }[]; label: string }) {
  const total = partes.reduce((s, x) => s + Math.max(0, x.v), 0)
  return (
    <div role="img" aria-label={label} className="flex h-[5px] w-full overflow-hidden rounded-pill" style={{ background: 'var(--control-track)' }}>
      {partes.map((x, i) => (
        <i key={i} className="block h-full" style={{ width: `${total > 0 ? (Math.max(0, x.v) / total) * 100 : 0}%`, background: x.color }} />
      ))}
    </div>
  )
}

function Ln({ k, v, main }: { k: ReactNode; v: ReactNode; main?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${main ? 'text-[14px] font-medium text-ink' : 'text-[13px] text-subtext'}`}>
      <span>{k}</span>
      <span className={`whitespace-nowrap text-right tabular-nums ${main ? 'text-[17px] font-bold tracking-[-0.01em]' : 'text-ink'}`}>{v}</span>
    </div>
  )
}

const Punto = ({ color }: { color: string }) => <i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color }} />

function Sobre({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-row-alt px-3.5 py-3">
      <h3 className="text-[13.5px] font-semibold text-ink">{titulo}</h3>
      {children}
    </div>
  )
}

const Nota = ({ children, cursiva }: { children: ReactNode; cursiva?: boolean }) => (
  <p className={`text-[12.5px] leading-[1.4] text-subtext ${cursiva ? 'italic' : ''}`}>{children}</p>
)

const th = 'whitespace-nowrap px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.04em] text-subtext first:text-left'
const td = 'whitespace-nowrap px-3 py-2 text-right tabular-nums first:text-left'

/** Detalle para contabilidad: va debajo de las tablas de Entradas y Salidas. No aplica a «Sin proyecto». */
export function DetalleContable({ p, hoy }: { p: ProyectoDetalle; hoy: string }) {
  if (p.sin_proyecto) return null
  const aprox = resumenProyecto(p, hoy).aprox
  const t = p.totales
  const c = p.cierre
  // [concepto, monto, ¿depende de totales estimados?]: lo del cliente y el subtotal de proveedores son exactos.
  const filas: [string, number, boolean][] = [
    ['Cobrado al cliente, sin IVA', t.cobros_sin_iva, false],
    ['IVA trasladado (16 %)', c.iva_cobrado, false],
    ['Subtotal de proveedores, sin IVA', -t.pagos_neto, false],
    ['IVA acreditable de proveedores', -c.iva_pagado, aprox],
    ['IVA neto a enterar', c.iva_neto_a_enterar, aprox],
    ['IVA retenido', c.iva_retenido_total, aprox],
    ['ISR retenido', c.isr_retenido_total, aprox],
  ]
  const q = c.quien_cuanto_cuando
  const suma = (k: 'neto' | 'iva_trasladado' | 'iva_retenido' | 'isr_retenido' | 'total_a_transferir') => round2(q.reduce((s, x) => s + x[k], 0))
  return (
    <details className="rounded-[10px] border border-hairline">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        Detalle para contabilidad
        <span aria-hidden className="text-subtext">+</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-hairline px-4 pb-4 pt-3.5">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
          {filas.map(([k, v, a]) => (
            <div key={k} className="contents">
              <span className="text-subtext">{k}</span>
              <span className="text-right tabular-nums text-ink">{montoAprox(v, a)}</span>
            </div>
          ))}
          <span className="font-bold text-ink">Total al SAT</span>
          <span className="text-right font-bold tabular-nums text-ink">{montoAprox(c.sat_total, aprox)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-subtext">
          <span>Cuadre: cobrado = proveedores + SAT + utilidad</span>
          {p.sin_proyecto ? null : Math.abs(c.cuadre_diferencia) > 0.01 ? (
            <StatusBadge tone="cancelled">{`Diferencia ${fmtMoney(c.cuadre_diferencia)}`}</StatusBadge>
          ) : (
            <StatusBadge tone="approved">Cuadra al centavo</StatusBadge>
          )}
        </div>
        {p.cierre_mensual.length > 0 && (
          <div>
            <div className="sn-caption mb-1.5">SAT por mes</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className={th}>Concepto</th>
                    <th className={th}>Monto</th>
                    <th className={th}>Fecha límite SAT</th>
                  </tr>
                </thead>
                <tbody>
                  {p.cierre_mensual.map((f, i) => (
                    <tr key={`${f.concepto}-${f.mes ?? 'pend'}-${i}`} className="border-t border-hairline">
                      <td className={td}>
                        <span className={`block font-medium ${f.a_favor ? 'text-approved-fg' : 'text-ink'}`}>{f.quien}</span>
                        <span className="block text-[10.5px] text-subtext">{f.sub}</span>
                      </td>
                      <td className={td}>{montoAprox(f.monto, aprox && f.mes === null)}</td>
                      <td className={td}>{f.fecha_limite ? fechaCorta(f.fecha_limite) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {q.length > 0 && (
          <div>
            <div className="sn-caption mb-1.5">Por proveedor</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className={th}>Proveedor</th>
                    <th className={th}>Régimen</th>
                    <th className={th}>Subtotal</th>
                    <th className={th}>IVA acred.</th>
                    <th className={th}>Ret. IVA</th>
                    <th className={th}>Ret. ISR</th>
                    <th className={th}>A transferir</th>
                    <th className={th}>Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {q.map((x) => (
                    <tr key={x.clave} className="border-t border-hairline">
                      <td className={td}>{x.proveedor_nombre}</td>
                      <td className={td}>{x.regimen_fiscal ? REGIMEN[x.regimen_fiscal] : 'Sin asignar'}</td>
                      <td className={td}>{fmtMoney(x.neto)}</td>
                      <td className={td}>{montoAprox(x.iva_trasladado, !x.total_es_snapshot)}</td>
                      <td className={td}>{montoAprox(x.iva_retenido, !x.total_es_snapshot)}</td>
                      <td className={td}>{montoAprox(x.isr_retenido, !x.total_es_snapshot)}</td>
                      <td className={td}>{montoAprox(x.total_a_transferir, !x.total_es_snapshot)}</td>
                      <td className={td}>{x.total_es_snapshot ? 'Factura' : 'Aprox.'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-hairline font-semibold text-ink">
                    <td className={td}>Total</td>
                    <td className={td} />
                    <td className={td}>{fmtMoney(suma('neto'))}</td>
                    <td className={td}>{montoAprox(suma('iva_trasladado'), aprox)}</td>
                    <td className={td}>{montoAprox(suma('iva_retenido'), aprox)}</td>
                    <td className={td}>{montoAprox(suma('isr_retenido'), aprox)}</td>
                    <td className={td}>{montoAprox(suma('total_a_transferir'), aprox)}</td>
                    <td className={td} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
        <p className="text-[12px] leading-[1.5] text-faint">
          Trasladado: IVA que cobras al cliente. Acreditable: IVA que pagas a proveedores y se descuenta. Retenido: IVA e ISR que Serenata retiene a personas físicas y entera al
          SAT. El IVA cuenta en el mes del cobro y en el del pago; el día 17 del mes siguiente es la fecha límite. El ISR es solo referencia.
        </p>
      </div>
    </details>
  )
}

/**
 * #140: lo primero que se lee del proyecto — qué deja, qué falta y cómo se reparte lo que pagó el cliente.
 * Todo sale de `totales` y `cierre` (SQL); aquí solo se presenta. «~» marca lo aproximado (sin factura de proveedor).
 */
export function ProyectoResumen({ p, hoy }: { p: ProyectoDetalle; hoy: string }) {
  if (p.sin_proyecto) return <p className="border-t border-hairline pt-3.5 text-[15px] font-medium text-body">Estas cuentas no pertenecen a ningún proyecto.</p>
  const r = resumenProyecto(p, hoy)
  const t = p.totales
  const c = p.cierre
  const retenciones = round2(c.iva_retenido_total + c.isr_retenido_total)
  const completo = t.por_cobrar <= 0.005
  return (
    <>
      <p className="border-t border-hairline pt-3.5 text-[17px] font-semibold leading-[1.35] text-ink [text-wrap:balance]">
        {r.utilidad < 0 ? (
          <>Este proyecto pierde <b className="font-bold text-cancelled-fg">{fmtMoney(-r.utilidad)}</b> antes de ISR.</>
        ) : (
          <>Este proyecto te deja <b className="font-bold text-accent-quiet">{fmtMoney(r.utilidad)}</b> antes de ISR.</>
        )}
        {r.falta && <span className="mt-1 block text-[15px] font-medium text-body">{r.falta}</span>}
      </p>

      {r.descuadre && (
        <div role="alert" className="rounded-control bg-cancelled-bg px-3 py-2 text-[13px] font-semibold text-cancelled-fg">
          El reparto no cuadra por {fmtMoney(c.cuadre_diferencia)}: revisa el detalle contable.
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-[10px] bg-row-alt px-3.5 py-3">
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13.5px] text-body">
          <span>
            El cliente ha pagado: <b className="font-semibold tabular-nums text-ink">{fmtMoney(t.cobrado)}</b>
          </span>
          {!completo && (
            <span>
              Por cobrar <b className="font-semibold tabular-nums text-ink">{fmtMoney(t.por_cobrar)}</b>
            </span>
          )}
        </div>
        <Barra label={`Cobrado ${fmtMoney(t.cobrado)} de ${fmtMoney(t.cobros_total)}`} partes={[{ v: t.cobrado, color: 'var(--sn-status-approved-fg)' }, { v: t.por_cobrar, color: 'transparent' }]} />
      </div>

      <div className="sn-caption">Así se reparte lo que pagó el cliente</div>
      <section aria-label="Reparto" className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
        <Sobre titulo="Proveedores">
          <Ln main k="A transferir" v={montoAprox(t.pagos_total, r.aprox)} />
          <Barra label={`Pagado ${fmtMoney(t.pagado)} de ${fmtMoney(t.pagos_total)}`} partes={[{ v: t.pagado, color: 'var(--accent)' }, { v: t.por_pagar, color: 'transparent' }]} />
          <Ln k="Pagado" v={fmtMoney(t.pagado)} />
          <Ln k="Por pagar" v={montoAprox(t.por_pagar, r.aprox)} />
          <Ln k="Facturas recibidas" v={`${r.facturas.recibidas} de ${r.facturas.total}`} />
          <Nota cursiva>Con IVA y menos retenciones.</Nota>
        </Sobre>
        <Sobre titulo="SAT">
          <Ln main k="IVA y retenciones" v={montoAprox(c.sat_total, r.aprox)} />
          <Barra label={`IVA neto ${fmtMoney(c.iva_neto_a_enterar)}, retenciones ${fmtMoney(retenciones)}`} partes={[{ v: c.iva_neto_a_enterar, color: 'var(--sn-status-issued-fg)' }, { v: retenciones, color: 'var(--sn-ink-muted)' }]} />
          <Ln k={<span><Punto color="var(--sn-status-issued-fg)" />IVA neto</span>} v={montoAprox(c.iva_neto_a_enterar, r.aprox)} />
          <Ln k={<span><Punto color="var(--sn-ink-muted)" />Retenciones</span>} v={montoAprox(retenciones, r.aprox)} />
          <Nota>Dinero de terceros.{r.avisoIva ? ` ${r.avisoIva}` : ''}</Nota>
          {r.vence && (
            <div className="mt-auto self-end pt-1">
              <StatusBadge tone="issued" className="px-3">{r.vence}</StatusBadge>
            </div>
          )}
        </Sobre>
        <Sobre titulo="Serenata">
          <Ln main k="Utilidad antes de ISR" v={fmtMoney(c.utilidad_bruta)} />
          <Barra label={`Libre ${fmtMoney(c.utilidad_libre_estimada)}, reservar ${fmtMoney(c.isr_serenata_estimado)}`} partes={[{ v: c.utilidad_libre_estimada, color: 'var(--sn-status-approved-fg)' }, { v: c.isr_serenata_estimado, color: 'var(--sn-status-issued-fg)' }]} />
          <Ln k={<span><Punto color="var(--sn-status-approved-fg)" />Libre para usar</span>} v={fmtMoney(c.utilidad_libre_estimada)} />
          <Ln k={<span><Punto color="var(--sn-status-issued-fg)" />No gastar: posible ISR (30 %)</span>} v={fmtMoney(c.isr_serenata_estimado)} />
          <Nota cursiva>Referencia: el ISR real se calcula con toda la empresa.</Nota>
        </Sobre>
      </section>
    </>
  )
}
