'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import type { LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import type { ContraparteSaldo, ProyectoSelector, RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { fechaCorta } from '../formato'
import { Enlace } from './compartido'
import { useProyectosSelector } from './useAcciones'

interface Props {
  /** `renglones`: marcar renglones de un proyecto. `proyecto`: elegir un solo proyecto (gasto extra). `pago`: marcar proyectos con saldo de una sola contraparte (Registrar pago por proyecto). */
  modo: 'renglones' | 'proyecto' | 'pago'
  /** Solo modo `pago`: de qué lado se buscan los saldos. */
  lado?: LadoCuentas
  /** Solo modo `pago`: contraparte ya fijada por el primer proyecto marcado; las demás quedan deshabilitadas (un pago, una contraparte). */
  contraparteFija?: string | null
  /** Solo modo `pago`: proyectos marcados. */
  proyectosMarcados?: string[]
  onTogglePago?: (proyecto: ProyectoSelector, contraparte: ContraparteSaldo) => void
  /** Proveedor con el que se prioriza la lista (sus proyectos primero). */
  contraparte?: string | null
  /** Texto con el que arranca la búsqueda (p. ej. el proyecto propuesto por el total del XML). */
  busquedaInicial?: string
  /** Renglones marcados (modo renglones). */
  seleccion?: string[]
  proyectoSeleccionado?: string | null
  onToggleRenglon?: (proyecto: ProyectoSelector, renglon: RenglonSelector) => void
  onElegirProyecto?: (proyecto: ProyectoSelector) => void
}

/**
 * Selector de proyectos con sus renglones (#130), una sola pieza para Subir factura (y, en C4, Registrar pago por
 * proyecto). Lee de SQL, paginado: búsqueda con debounce, "solo con pendientes" y "Cargar más". Una factura de proveedor
 * es de un solo proyecto (P10): el padre reemplaza la selección al marcar un renglón de otro proyecto.
 */
export function SelectorProyectos({ modo, lado = 'proveedor', contraparteFija = null, proyectosMarcados = [], onTogglePago, contraparte = null, busquedaInicial = '', seleccion = [], proyectoSeleccionado = null, onToggleRenglon, onElegirProyecto }: Props) {
  const [q, setQ] = useState(busquedaInicial)
  const [soloPendientes, setSoloPendientes] = useState(modo === 'renglones')
  const pago = modo === 'pago'
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(proyectoSeleccionado ? [proyectoSeleccionado] : []))
  const { proyectos, total, error, cargando, cargandoMas, hayMas, cargarMas } = useProyectosSelector(pago ? { modo: 'pago', lado, q, soloPendientes: true } : { modo: 'renglones', lado: 'proveedor', q, contraparte, soloPendientes }, true)

  const alternar = (id: string) =>
    setAbiertos((a) => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="overflow-hidden rounded-panel border border-hairline">
      <div className="flex flex-col gap-2.5 bg-row-alt px-3.5 py-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, proyecto o cliente" aria-label="Buscar proyecto" />
        </div>
        {!pago && (
          <label className="flex items-center gap-2 text-[12.5px] text-body">
            <Checkbox checked={soloPendientes} onChange={setSoloPendientes} label="Solo con pendientes" />
            Solo con pendientes
          </label>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto" role={modo === 'proyecto' ? 'group' : undefined} aria-label={modo === 'proyecto' ? 'Proyectos' : undefined}>
        {error && <div className="border-t border-hairline px-3.5 py-3 text-[12.5px] text-subtext">{error}</div>}
        {cargando && !error && <div className="border-t border-hairline px-3.5 py-3 text-[12.5px] text-subtext">Buscando…</div>}
        {!cargando && !error && proyectos.length === 0 && <div className="border-t border-hairline px-3.5 py-3 text-[12.5px] text-subtext">Sin proyectos con esos filtros.</div>}

        {pago &&
          proyectos.map((p) => (
            <div key={p.proyecto_id} className="border-t border-hairline">
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="sn-folio w-[64px] flex-none text-[11px] text-accent">{p.proyecto_id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{p.proyecto ?? '—'}</span>
                  <span className="block truncate text-[11.5px] text-subtext">{p.cliente ?? 'Sin cliente'}</span>
                </span>
              </div>
              {(p.contrapartes ?? []).map((c) => {
                const otra = Boolean(contraparteFija) && contraparteFija !== c.id
                const marcado = contraparteFija === c.id && proyectosMarcados.includes(p.proyecto_id)
                const apagada = otra || !c.id
                return (
                  <div key={`${p.proyecto_id}:${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline bg-row px-3.5 py-2 pl-10 text-[12.5px] max-md:pl-3.5">
                    <Checkbox checked={marcado} disabled={apagada} onChange={() => onTogglePago?.(p, c)} label={`Incluir ${p.proyecto_id} · ${c.nombre}`} />
                    <span className={`min-w-[120px] flex-1 truncate ${apagada ? 'text-faint' : 'text-ink'}`}>{c.nombre}</span>
                    <span className="flex flex-none items-center gap-3">
                      <span className="text-[11.5px] text-subtext">{c.facturas === 1 ? '1 factura' : `${c.facturas} facturas`}</span>
                      {otra && <StatusBadge tone="draft">Otra contraparte</StatusBadge>}
                      {!c.id && <StatusBadge tone="draft">Sin ficha</StatusBadge>}
                      {!apagada && <StatusBadge tone="issued">Por pagar</StatusBadge>}
                      <span className={`whitespace-nowrap font-semibold ${apagada ? 'text-faint' : 'text-ink'}`}>{fmtMoney(c.saldo)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          ))}

        {!pago &&
          proyectos.map((p) => {
            const renglones = p.renglones ?? []
            const abierto = modo === 'renglones' && abiertos.has(p.proyecto_id)
            const marcados = renglones.filter((r) => seleccion.includes(r.cuenta_id)).length
            const elegido = modo === 'proyecto' && proyectoSeleccionado === p.proyecto_id
            const libres = renglones.filter((r) => !r.responsable_id)
            const montoLibre = libres.reduce((a, r) => a + r.costo_total, 0)
            // Los renglones se agrupan por proveedor, como en la maqueta: de quién son decide si se pueden mover.
            const grupos = new Map<string, RenglonSelector[]>()
            for (const r of renglones) grupos.set(r.responsable_id ?? '', [...(grupos.get(r.responsable_id ?? '') ?? []), r])
            return (
              <div key={p.proyecto_id} className="border-t border-hairline">
                <button
                  type="button"
                  aria-expanded={modo === 'renglones' ? abierto : undefined}
                  aria-pressed={modo === 'proyecto' ? elegido : undefined}
                  onClick={() => (modo === 'renglones' ? alternar(p.proyecto_id) : onElegirProyecto?.(p))}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-row-alt"
                >
                  {modo === 'renglones' ? (
                    <Icon name={abierto ? 'chevron-down' : 'chevron-right'} size={15} className="flex-none text-subtext" />
                  ) : (
                    <span className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${elegido ? 'border-accent bg-accent text-accent-ink' : 'border-hairline bg-card'}`}>
                      {elegido && <Icon name="check" size={11} strokeWidth={3} />}
                    </span>
                  )}
                  <span className="sn-folio w-[64px] flex-none text-[11px] text-accent">{p.proyecto_id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.proyecto ?? '—'}</span>
                    <span className="block truncate text-[11.5px] text-subtext">
                      {p.cliente ?? 'Sin cliente'}
                      {modo === 'renglones' && libres.length > 0 ? ` · ${libres.length} por asignar` : ''}
                    </span>
                  </span>
                  {modo === 'renglones' && montoLibre > 0 && (
                    <span className="hidden flex-none text-right md:block">
                      <span className="block text-[11px] text-subtext">Por asignar</span>
                      <span className="block text-[12.5px] font-semibold text-ink">{fmtMoney(montoLibre)}</span>
                    </span>
                  )}
                  <span className="hidden whitespace-nowrap text-[11.5px] text-subtext md:inline">{fechaCorta(p.fecha_entrega)}</span>
                  {marcados > 0 && <span className="flex-none whitespace-nowrap text-[11.5px] font-medium text-body">{marcados} marcados</span>}
                </button>
                {abierto && (
                  <div className="border-t border-hairline bg-row">
                    {renglones.length === 0 && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">Sin renglones.</div>}
                    {Array.from(grupos.values()).map((rs) => {
                      const dueno = rs[0].responsable
                      const todosBloqueados = rs.every((r) => r.bloqueado)
                      const esActual = Boolean(contraparte) && rs[0].responsable_id === contraparte
                      const estado = !dueno ? 'por asignar' : rs[0].grupo_estado === 'ABIERTO' ? 'grupo abierto' : rs[0].grupo_estado === 'PAGADO' ? 'pagado' : rs[0].grupo_estado === 'EN_PROCESO_PAGO' ? 'en pago' : 'con factura'
                      return (
                        <div key={rs[0].responsable_id ?? 'libres'}>
                          <div className="flex items-center gap-3 border-t border-hairline bg-row-alt px-3.5 py-1.5 first:border-t-0 max-md:pl-3.5 md:pl-10">
                            <span className="sn-caption min-w-0 flex-1 truncate">
                              {dueno ?? 'Sin proveedor'} · {estado}
                            </span>
                            {todosBloqueados && <StatusBadge tone="draft">No se puede mover</StatusBadge>}
                            {!todosBloqueados && esActual && <StatusBadge tone="issued">Proveedor actual</StatusBadge>}
                            {!todosBloqueados && !esActual && !dueno && <StatusBadge tone="draft">Por asignar</StatusBadge>}
                          </div>
                          {rs.map((r) => (
                            <div key={r.cuenta_id} className="flex items-center gap-3 border-t border-hairline px-3.5 py-2 text-[12.5px] max-md:pl-3.5 md:pl-10">
                              <Checkbox checked={seleccion.includes(r.cuenta_id)} disabled={r.bloqueado} onChange={() => onToggleRenglon?.(p, r)} label={`Incluir ${r.descripcion}`} />
                              <span className={`min-w-0 flex-1 truncate ${r.bloqueado ? 'text-faint' : 'text-ink'}`}>
                                {r.descripcion}
                                {r.gasto_extra && <span className="text-faint"> · gasto extra</span>}
                              </span>
                              <span className={`whitespace-nowrap font-semibold ${r.bloqueado ? 'text-faint' : 'text-ink'}`}>{fmtMoney(r.costo_total)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
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
