'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import type { LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import type { ProyectoSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { fechaCorta } from '../formato'
import { BarraSeleccion, Enlace } from './compartido'
import { useProyectosSelector } from './useAcciones'

interface Props {
  /** `proyecto`: elegir un solo proyecto (factura de proveedor). `pago`: marcar proyectos con saldo de la contraparte elegida (Registrar pago por proyecto). */
  modo: 'proyecto' | 'pago'
  /** Solo modo `pago`: de qué lado se buscan los saldos. */
  lado?: LadoCuentas
  /** Solo modo `pago`: proyectos marcados. */
  proyectosMarcados?: string[]
  onTogglePago?: (proyecto: ProyectoSelector) => void
  /** Solo modo `pago`: «Marcar todos / Quitar todos» deja marcados exactamente estos proyectos. */
  onMarcarPago?: (ids: string[]) => void
  /** Modo `pago`: la contraparte de la que se listan los proyectos con saldo. Modo `proyecto`: proveedor con el que se prioriza la lista (sus proyectos primero). */
  contraparte?: string | null
  proyectoSeleccionado?: string | null
  onElegirProyecto?: (proyecto: ProyectoSelector) => void
}

/**
 * Selector de proyectos (#130), una sola pieza para Subir factura de proveedor (`proyecto`) y Registrar pago por
 * proyecto (`pago`). Lee de SQL, paginado: búsqueda con debounce y "Cargar más".
 */
export function SelectorProyectos({ modo, lado = 'proveedor', proyectosMarcados = [], onTogglePago, onMarcarPago, contraparte = null, proyectoSeleccionado = null, onElegirProyecto }: Props) {
  const [q, setQ] = useState('')
  const pago = modo === 'pago'
  const { proyectos, total, error, cargando, cargandoMas, hayMas, cargarMas } = useProyectosSelector(pago ? { modo: 'pago', lado, q, contraparte, soloPendientes: true } : { modo: 'renglones', lado: 'proveedor', q, contraparte, soloPendientes: false }, true)

  return (
    <div className="overflow-hidden rounded-panel border border-hairline">
      <div className="bg-row-alt px-3.5 py-3">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, proyecto o cliente" aria-label="Buscar proyecto" />
      </div>

      <div className="max-h-[420px] overflow-y-auto" role={pago ? undefined : 'group'} aria-label={pago ? undefined : 'Proyectos'}>
        {error && <div className="border-t border-hairline px-3.5 py-3 text-[12.5px] text-subtext">{error}</div>}
        {cargando && !error && <div className="border-t border-hairline px-3.5 py-3 text-[12.5px] text-subtext">Buscando…</div>}
        {!cargando && !error && proyectos.length === 0 && <div className="border-t border-hairline px-3.5 py-3 text-[12.5px] text-subtext">Sin proyectos con esos filtros.</div>}

        {pago && onMarcarPago && proyectos.length > 0 && (
          <BarraSeleccion
            resumen={`${proyectos.filter((p) => proyectosMarcados.includes(p.proyecto_id)).length} de ${total} ${total === 1 ? 'marcado' : 'marcados'} · ${fmtMoney(
              proyectos.filter((p) => proyectosMarcados.includes(p.proyecto_id)).reduce((a, p) => a + (p.contrapartes ?? []).filter((c) => c.id === contraparte).reduce((x, c) => x + c.saldo, 0), 0)
            )} por pagar`}
            onTodas={() => onMarcarPago(proyectos.map((p) => p.proyecto_id))}
            onNinguna={() => onMarcarPago([])}
            etiquetaTodas="Marcar todos"
            etiquetaNinguna="Quitar todos"
          />
        )}
        {pago &&
          proyectos.map((p) => {
            const c = (p.contrapartes ?? []).find((x) => x.id === contraparte)
            return (
              <div key={p.proyecto_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-3.5 py-2.5">
                <Checkbox checked={proyectosMarcados.includes(p.proyecto_id)} onChange={() => onTogglePago?.(p)} label={`Incluir ${p.proyecto_id} · ${p.proyecto ?? ''}`} />
                <span className="sn-folio w-[64px] flex-none text-[11px] text-accent">{p.proyecto_id}</span>
                <span className="min-w-[120px] flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{p.proyecto ?? '—'}</span>
                  <span className="block truncate text-[11.5px] text-subtext">{p.cliente ?? 'Sin cliente'}</span>
                </span>
                {c && (
                  <span className="flex flex-none items-center gap-3">
                    <span className="text-[11.5px] text-subtext">{c.facturas === 1 ? '1 factura' : `${c.facturas} facturas`}</span>
                    <StatusBadge tone="issued">Por pagar</StatusBadge>
                    <span className="whitespace-nowrap font-semibold text-ink">{fmtMoney(c.saldo)}</span>
                  </span>
                )}
              </div>
            )
          })}

        {!pago &&
          proyectos.map((p) => {
            const elegido = proyectoSeleccionado === p.proyecto_id
            return (
              <button
                key={p.proyecto_id}
                type="button"
                aria-pressed={elegido}
                onClick={() => onElegirProyecto?.(p)}
                className="flex w-full items-center gap-3 border-t border-hairline px-3.5 py-2.5 text-left hover:bg-row-alt"
              >
                <span className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${elegido ? 'border-accent bg-accent text-accent-ink' : 'border-hairline bg-card'}`}>
                  {elegido && <Icon name="check" size={11} strokeWidth={3} />}
                </span>
                <span className="sn-folio w-[64px] flex-none text-[11px] text-accent">{p.proyecto_id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{p.proyecto ?? '—'}</span>
                  <span className="block truncate text-[11.5px] text-subtext">{p.cliente ?? 'Sin cliente'}</span>
                </span>
                <span className="hidden whitespace-nowrap text-[11.5px] text-subtext md:inline">{fechaCorta(p.fecha_entrega)}</span>
              </button>
            )
          })}
      </div>

      {hayMas && (
        <div className="flex items-center justify-between border-t border-hairline px-3.5 py-2.5 text-[12px] text-subtext">
          <span>
            {proyectos.length} de {total} proyectos
          </span>
          <Enlace onClick={cargarMas} disabled={cargandoMas}>
            {cargandoMas ? 'Cargando…' : 'Cargar más'}
          </Enlace>
        </div>
      )}
    </div>
  )
}
