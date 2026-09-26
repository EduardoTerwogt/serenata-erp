'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { ListaRadio, SearchableSelect } from '@/components/ui/SearchableSelect'
import { Switch } from '@/components/ui/Switch'
import type { FiltroEstado, FiltroTipo, MesPeriodo } from '@/lib/shared/cuentas/periodo-tipos'
import type { EstadoCuentas } from './useCuentasUrl'

export const ETIQUETA_ESTADO: Record<FiltroEstado, string> = { todas: 'Todas', pendientes: 'Pendientes', cerradas: 'Cerradas' }
export const ETIQUETA_TIPO: Record<FiltroTipo, string> = { todo: 'Todo', cobro: 'Por cobrar', pago: 'Por pagar' }

export type CambioFiltros = Partial<Pick<EstadoCuentas, 'estado' | 'tipo' | 'cliente' | 'proveedor' | 'mes' | 'agrupar'>>

/**
 * Reglas de interacción del README (cuentas-data.js, `controls`):
 * - "Pendientes" cambia el periodo a "Todo el año";
 * - elegir "Por pagar" limpia Cliente y "Por cobrar" limpia Proveedor;
 * - elegir un Cliente limpia "Por pagar" y un Proveedor limpia "Por cobrar".
 */
export function reglasFiltros(actual: Pick<EstadoCuentas, 'tipo' | 'cliente' | 'proveedor'>, cambio: CambioFiltros): CambioFiltros {
  const r: CambioFiltros = { ...cambio }
  if (cambio.estado === 'pendientes') r.mes = 'todo' as MesPeriodo
  if (cambio.tipo === 'pago') r.cliente = ''
  if (cambio.tipo === 'cobro') r.proveedor = ''
  if (cambio.cliente && (cambio.tipo ?? actual.tipo) === 'pago') r.tipo = 'todo'
  if (cambio.proveedor && (cambio.tipo ?? actual.tipo) === 'cobro') r.tipo = 'todo'
  return r
}

export function chipsActivos(e: EstadoCuentas) {
  const chips: { k: string; v: string; quitar: CambioFiltros }[] = []
  if (e.estado !== 'todas') chips.push({ k: 'Estado', v: ETIQUETA_ESTADO[e.estado], quitar: { estado: 'todas' } })
  if (e.tipo !== 'todo') chips.push({ k: 'Tipo', v: ETIQUETA_TIPO[e.tipo], quitar: { tipo: 'todo' } })
  if (e.cliente) chips.push({ k: 'Cliente', v: e.cliente, quitar: { cliente: '' } })
  if (e.proveedor) chips.push({ k: 'Proveedor', v: e.proveedor, quitar: { proveedor: '' } })
  return chips
}

const LIMPIAR: CambioFiltros = { estado: 'todas', tipo: 'todo', cliente: '', proveedor: '' }

interface FiltrosProps {
  estado: EstadoCuentas
  conteo: { todas: number; pendientes: number; cerradas: number }
  clientes: string[]
  proveedores: string[]
  mes: MesPeriodo
  onCambio: (c: CambioFiltros) => void
}

export function Chips({ estado, onCambio, className = '' }: { estado: EstadoCuentas; onCambio: (c: CambioFiltros) => void; className?: string }) {
  const chips = chipsActivos(estado)
  if (chips.length === 0) return null
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {chips.map((c) => (
        <span key={c.k} className="inline-flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-pill border border-hairline bg-card pl-[11px] pr-1.5 text-[12px] text-body">
          <span className="text-subtext">{c.k}</span>
          <span className="font-medium text-ink">{c.v}</span>
          <button
            type="button"
            aria-label={`Quitar ${c.k}`}
            onClick={() => onCambio(c.quitar)}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-pill bg-row-alt text-subtext"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
    </div>
  )
}

function ColumnaFiltro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="sn-caption px-2 pb-1">{titulo}</div>
      {children}
    </div>
  )
}

/** Escritorio: botón "Filtros" con contador y panel de 640px con 4 columnas. */
export function FiltrosEscritorio({ estado, conteo, clientes, proveedores, mes, onCambio }: FiltrosProps) {
  const [abierto, setAbierto] = useState(false)
  const n = chipsActivos(estado).length
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return undefined
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [abierto])
  const lista = (xs: string[]) => xs.map((x) => ({ value: x, label: x }))
  const opcionesCliente = useMemo(() => lista(clientes), [clientes])
  const opcionesProveedor = useMemo(() => lista(proveedores), [proveedores])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`flex h-8 items-center gap-2 rounded-control border bg-input px-3 text-[12.5px] font-medium text-body hover:bg-row-alt ${abierto || n ? 'border-accent-quiet' : 'border-hairline'}`}
      >
        <Icon name="sliders-horizontal" size={14} />
        Filtros
        {n > 0 && <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-accent px-[5px] text-[11px] font-semibold text-white">{n}</span>}
        <Icon name="chevron-down" size={14} />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div role="dialog" aria-label="Filtros" className="absolute left-0 top-[calc(100%+8px)] z-[31] w-[min(640px,calc(100vw-2*var(--content-pad)-var(--sidebar-width)))] overflow-hidden rounded-panel border border-hairline bg-card shadow-raised">
            <div className="grid gap-2 px-2.5 py-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <ColumnaFiltro titulo="Estado">
                <ListaRadio
                  opciones={(['todas', 'pendientes', 'cerradas'] as const).map((k) => ({ value: k, label: ETIQUETA_ESTADO[k], count: conteo[k] }))}
                  value={estado.estado}
                  onChange={(v) => onCambio({ estado: v as FiltroEstado })}
                />
              </ColumnaFiltro>
              <ColumnaFiltro titulo="Tipo">
                <ListaRadio
                  opciones={(['todo', 'cobro', 'pago'] as const).map((k) => ({ value: k, label: ETIQUETA_TIPO[k] }))}
                  value={estado.tipo}
                  onChange={(v) => onCambio({ tipo: v as FiltroTipo })}
                />
              </ColumnaFiltro>
              <ColumnaFiltro titulo="Cliente">
                <ListaRadio opciones={opcionesCliente} value={estado.cliente} todos="Todos" buscar maxHeight={236} onChange={(v) => onCambio({ cliente: v })} />
              </ColumnaFiltro>
              <ColumnaFiltro titulo="Proveedor">
                <ListaRadio opciones={opcionesProveedor} value={estado.proveedor} todos="Todos" buscar maxHeight={236} onChange={(v) => onCambio({ proveedor: v })} />
              </ColumnaFiltro>
            </div>
            <div className="flex items-center gap-3 border-t border-hairline bg-row-alt px-[18px] py-[11px]">
              {mes === 'todo' && <Switch label="Agrupar por mes" checked={estado.agrupar} onChange={(v) => onCambio({ agrupar: v })} />}
              <div className="flex-1" />
              <button type="button" onClick={() => onCambio(LIMPIAR)} className="text-[12.5px] text-accent hover:text-accent-pressed">
                Limpiar filtros
              </button>
              <Button size="md" onClick={() => setAbierto(false)}>
                Listo
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Pastillas<T extends string>({ opciones, valor, onPick }: { opciones: { v: T; label: string }[]; valor: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={valor === o.v}
          onClick={() => onPick(o.v)}
          className={`h-9 rounded-pill border px-3.5 text-[13.5px] ${valor === o.v ? 'border-accent bg-accent font-semibold text-white' : 'border-hairline bg-card text-body'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Móvil: hoja Filtros con Estado y Tipo como chips y Cliente/Proveedor con buscador. */
export function HojaFiltros({ estado, conteo, clientes, proveedores, mes, onCambio, onClose, resultados }: FiltrosProps & { onClose: () => void; resultados: string }) {
  return (
    <BottomSheet
      title="Filtros"
      onClose={onClose}
      label="Filtros"
      action={
        <button type="button" onClick={() => onCambio(LIMPIAR)} className="text-[15px] text-accent">
          Limpiar
        </button>
      }
      footer={
        <Button fullWidth onClick={onClose}>
          {resultados}
        </Button>
      }
    >
      <div className="flex flex-col gap-[18px] px-4 pb-4">
        <div className="flex flex-col gap-2">
          <span className="sn-caption">Estado</span>
          <Pastillas
            opciones={(['todas', 'pendientes', 'cerradas'] as const).map((k) => ({ v: k, label: `${ETIQUETA_ESTADO[k]} · ${conteo[k]}` }))}
            valor={estado.estado}
            onPick={(v) => onCambio({ estado: v })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="sn-caption">Tipo</span>
          <Pastillas opciones={(['todo', 'cobro', 'pago'] as const).map((k) => ({ v: k, label: ETIQUETA_TIPO[k] }))} valor={estado.tipo} onPick={(v) => onCambio({ tipo: v })} />
        </div>
        <SearchableSelect label="Cliente" opciones={clientes} value={estado.cliente} todos="Todos los clientes" onChange={(v) => onCambio({ cliente: v })} />
        <SearchableSelect label="Proveedor" opciones={proveedores} value={estado.proveedor} todos="Todos los proveedores" onChange={(v) => onCambio({ proveedor: v })} />
        {mes === 'todo' && <Switch label="Agrupar por mes" checked={estado.agrupar} onChange={(v) => onCambio({ agrupar: v })} />}
      </div>
    </BottomSheet>
  )
}
