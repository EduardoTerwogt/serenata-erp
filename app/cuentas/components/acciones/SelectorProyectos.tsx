'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { SectionLoading } from '@/components/ui/SectionLoading'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtMoney } from '@/lib/quotations/format'
import type { ProyectoSelector, RenglonSelector } from '@/lib/shared/cuentas/proyectos-selector-tipos'
import { fechaCorta } from '../formato'
import { Enlace } from './compartido'
import { useProyectosSelector } from './useAcciones'

interface Props {
  /** `renglones`: marcar renglones de un proyecto. `proyecto`: elegir un solo proyecto (gasto extra). */
  modo: 'renglones' | 'proyecto'
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
export function SelectorProyectos({ modo, contraparte = null, busquedaInicial = '', seleccion = [], proyectoSeleccionado = null, onToggleRenglon, onElegirProyecto }: Props) {
  const [q, setQ] = useState(busquedaInicial)
  const [soloPendientes, setSoloPendientes] = useState(modo === 'renglones')
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(proyectoSeleccionado ? [proyectoSeleccionado] : []))
  const { proyectos, total, error, cargando, cargandoMas, hayMas, cargarMas } = useProyectosSelector({ modo: 'renglones', lado: 'proveedor', q, contraparte, soloPendientes }, true)

  const alternar = (id: string) =>
    setAbiertos((a) => {
      const n = new Set(a)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="overflow-hidden rounded-panel border border-hairline">
      <div className="flex flex-col gap-2.5 border-b border-hairline bg-row-alt px-3.5 py-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar folio, proyecto o cliente" aria-label="Buscar proyecto" />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-body">
          <Checkbox checked={soloPendientes} onChange={setSoloPendientes} label="Solo con renglones por asignar o saldo abierto" />
          Solo con pendientes
        </label>
      </div>

      {error && <div className="px-3.5 py-3 text-[12.5px] text-subtext">{error}</div>}
      {cargando && !error && <SectionLoading className="min-h-[96px]" />}
      {!cargando && !error && proyectos.length === 0 && <div className="px-3.5 py-3 text-[12.5px] text-subtext">Sin proyectos con esos filtros.</div>}

      {proyectos.map((p) => {
        const renglones = p.renglones ?? []
        const abierto = modo === 'renglones' && (abiertos.has(p.proyecto_id) || proyectoSeleccionado === p.proyecto_id)
        const marcados = renglones.filter((r) => seleccion.includes(r.cuenta_id)).length
        const elegido = modo === 'proyecto' && proyectoSeleccionado === p.proyecto_id
        const porAsignar = renglones.filter((r) => !r.responsable_id).length
        return (
          <div key={p.proyecto_id} className="border-t border-hairline first:border-t-0">
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
                  {modo === 'renglones' && porAsignar > 0 ? ` · ${porAsignar} por asignar` : ''}
                </span>
              </span>
              <span className="hidden whitespace-nowrap text-[11.5px] text-subtext md:inline">{fechaCorta(p.fecha_entrega)}</span>
              {marcados > 0 && <StatusBadge tone="issued">{marcados} marcados</StatusBadge>}
            </button>
            {abierto && (
              <div className="border-t border-hairline bg-row-alt/50">
                {renglones.length === 0 && <div className="px-3.5 py-2.5 text-[12.5px] text-subtext">Sin renglones.</div>}
                {renglones.map((r) => (
                  <div key={r.cuenta_id} className={`flex items-center gap-3 border-t border-hairline px-3.5 py-2 pl-10 text-[12.5px] first:border-t-0 ${r.bloqueado ? 'opacity-45' : ''}`}>
                    <Checkbox checked={seleccion.includes(r.cuenta_id)} disabled={r.bloqueado} onChange={() => onToggleRenglon?.(p, r)} label={`Incluir ${r.descripcion}`} />
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {r.descripcion}
                      {r.gasto_extra && <span className="text-faint"> · gasto extra</span>}
                    </span>
                    <span className="hidden max-w-[160px] truncate text-[11.5px] text-subtext md:inline">{r.responsable ?? 'Por asignar'}</span>
                    <span className="whitespace-nowrap font-semibold text-ink">{fmtMoney(r.costo_total)}</span>
                    {r.bloqueado && <StatusBadge tone="draft">No se puede mover</StatusBadge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

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
