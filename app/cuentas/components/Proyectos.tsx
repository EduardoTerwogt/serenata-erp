'use client'

import { Icon } from '@/components/ui/Icon'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import type { TarjetaProyecto } from '@/lib/shared/cuentas/periodo-tipos'
import { MESES_LARGOS, fechaCorta, plural } from './formato'
import { chipProyecto } from './ui'

export interface GrupoProyectos {
  key: string
  label: string | null
  proyectos: TarjetaProyecto[]
}

/** Agrupa por mes en "Todo el año" con "Agrupar por mes"; "Sin fecha" siempre va aparte al final (S17). */
export function agruparProyectos(proyectos: TarjetaProyecto[], sinFecha: TarjetaProyecto[], anio: number, porMes: boolean): GrupoProyectos[] {
  const grupos: GrupoProyectos[] = []
  if (porMes) {
    for (const p of proyectos) {
      const key = `m${p.mes}`
      let g = grupos.find((x) => x.key === key)
      if (!g) grupos.push((g = { key, label: `${MESES_LARGOS[(p.mes ?? 1) - 1]} ${anio}`, proyectos: [] }))
      g.proyectos.push(p)
    }
  } else if (proyectos.length) grupos.push({ key: 'todos', label: null, proyectos })
  if (sinFecha.length) grupos.push({ key: 'sin-fecha', label: 'Sin fecha', proyectos: sinFecha })
  return grupos
}

function metricas(p: TarjetaProyecto) {
  return p.cuentas.cerradas
    ? [
        { k: 'Ingreso', v: p.totales.cobros_total, acento: false },
        { k: 'Egreso', v: p.totales.pagos_total, acento: false },
      ]
    : [
        { k: 'Por cobrar', v: p.totales.por_cobrar, acento: true },
        { k: 'Por pagar', v: p.totales.por_pagar, acento: false },
      ]
}

const TONO_CLASE: Record<StatusTone, string> = {
  approved: 'bg-approved-bg text-approved-fg',
  issued: 'bg-issued-bg text-issued-fg',
  draft: 'bg-draft-bg text-draft-fg',
  cancelled: 'bg-cancelled-bg text-cancelled-fg',
}

const evento = (p: TarjetaProyecto) => (p.sin_proyecto ? 'Sin proyecto' : p.fecha_entrega ? `Evento ${fechaCorta(p.fecha_entrega)}` : 'Sin fecha de evento')
const folio = (p: TarjetaProyecto) => (p.sin_proyecto ? null : p.id)

function EncabezadoGrupo({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-hairline pb-1.5">
      <span className="text-[14.5px] font-semibold text-ink">{label}</span>
      <span className="text-[12px] text-subtext md:text-[12.5px]">{plural(n, 'proyecto', 'proyectos')}</span>
    </div>
  )
}

/** Tarjetas de proyecto sin selección: la larga en escritorio y la de móvil (sin folio). */
export function ListaProyectos({ grupos, onAbrir }: { grupos: GrupoProyectos[]; onAbrir: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-[18px] px-4 md:gap-[22px] md:px-0">
      {grupos.map((g) => (
        <div key={g.key} className="flex flex-col gap-2.5">
          {g.label && <EncabezadoGrupo label={g.label} n={g.proyectos.length} />}
          {g.proyectos.map((p) => {
            const chip = chipProyecto(p)
            const [m1, m2] = metricas(p)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onAbrir(p.id)}
                aria-label={`Abrir ${p.nombre}`}
                className="w-full rounded-panel border border-hairline bg-card text-left shadow-card transition-colors hover:bg-row-alt"
              >
                <div className="hidden items-center gap-3 px-[18px] py-[15px] md:flex">
                  <Icon name="folder" size={16} className={p.cuentas.cerradas ? 'text-faint' : 'text-accent'} />
                  <div className="min-w-0 flex-[0_1_auto]">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {folio(p) && <span className="sn-folio">{folio(p)}</span>}
                      <span className="truncate text-[14.5px] font-semibold text-ink">{p.nombre}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-subtext">
                      {p.cliente ? `${p.cliente} · ` : ''}
                      {evento(p)}
                    </div>
                  </div>
                  <StatusBadge tone={chip.tone}>{chip.label}</StatusBadge>
                  <div className="ml-auto flex gap-[18px] text-right text-[12px] text-subtext">
                    {[m1, m2].map((m) => (
                      <div key={m.k}>
                        <div>{m.k}</div>
                        <div className="mt-0.5 whitespace-nowrap text-[13.5px] font-semibold text-ink">{fmtMoney(m.v)}</div>
                      </div>
                    ))}
                  </div>
                  <Icon name="chevron-right" size={16} className="text-faint" />
                </div>
                <div className="flex flex-col gap-2 px-3.5 py-[11px] md:hidden">
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-ink">{p.nombre}</div>
                      <div className="mt-px truncate text-[12px] text-subtext">
                        {p.cliente ? `${p.cliente} · ` : ''}
                        {evento(p)}
                      </div>
                    </div>
                    <StatusBadge tone={chip.tone} className="flex-none">
                      {chip.label}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center gap-4 border-t border-hairline pt-2">
                    {[m1, m2].map((m) => (
                      <div key={m.k} className="min-w-0 flex-1">
                        <div className="text-[11px] text-subtext">{m.k}</div>
                        <div className={`mt-px whitespace-nowrap text-[14px] font-semibold ${m.acento ? 'text-accent' : 'text-ink'}`}>{fmtMoney(m.v)}</div>
                      </div>
                    ))}
                    <Icon name="chevron-right" size={18} className="text-faint" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Lista compacta del maestro-detalle (columna derecha); tocar el activo lo deselecciona. */
export function ListaCompacta({ grupos, activo, onAbrir }: { grupos: GrupoProyectos[]; activo: string; onAbrir: (id: string) => void }) {
  return (
    <nav aria-label="Proyectos del periodo" className="overflow-hidden rounded-panel border border-hairline bg-card shadow-card">
      {grupos.map((g) => (
        <div key={g.key}>
          {g.label && (
            <div className="flex justify-between border-b border-hairline bg-row-alt px-3.5 pb-2 pt-2.5">
              <span className="text-[12px] font-semibold text-ink">{g.label}</span>
              <span className="text-[11px] text-subtext">{plural(g.proyectos.length, 'proyecto', 'proyectos')}</span>
            </div>
          )}
          {g.proyectos.map((p) => {
            const on = p.id === activo
            const chip = chipProyecto(p)
            return (
              <button
                key={p.id}
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => onAbrir(p.id)}
                className="flex w-full items-center gap-2.5 border-b border-hairline px-3.5 py-3 text-left"
                style={on ? { background: 'rgba(254,123,1,.08)', boxShadow: 'inset -3px 0 0 var(--accent)' } : undefined}
              >
                <Icon name="folder" size={15} className={p.cuentas.cerradas ? 'text-faint' : 'text-accent'} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline gap-2">
                    {folio(p) && <span className="sn-folio text-[10.5px]">{folio(p)}</span>}
                    <span className="truncate text-[13px] font-semibold text-ink">{p.nombre}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] text-subtext">
                    {p.cliente ? `${p.cliente} · ` : ''}
                    {p.fecha_entrega ? fechaCorta(p.fecha_entrega) : 'Sin fecha'}
                  </div>
                </div>
                <span className={`inline-flex h-5 min-w-[26px] items-center justify-center rounded-pill px-[7px] text-[10.5px] font-semibold ${TONO_CLASE[chip.tone]}`}>
                  {chip.corto}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
