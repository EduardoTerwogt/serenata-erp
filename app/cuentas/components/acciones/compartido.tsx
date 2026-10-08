'use client'

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge, type StatusTone } from '@/components/ui/StatusBadge'

/** Encabezado de sección con acción opcional a la derecha ("Aplicar a facturas" · "Sugerir…"). */
export function Cap({ children, derecha }: { children: ReactNode; derecha?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="sn-caption">{children}</span>
      {derecha}
    </div>
  )
}

/** Dato con etiqueta chica arriba (Total · Saldo · Aplicado, receptor, RFC…). */
export function Dato({ k, v, mono = false, fuerte = false, derecha = false }: { k: string; v: ReactNode; mono?: boolean; fuerte?: boolean; derecha?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${derecha ? 'items-end text-right' : ''}`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-subtext">{k}</span>
      <span className={`truncate text-[12.5px] text-ink ${mono ? 'font-mono' : ''} ${fuerte ? 'font-semibold' : ''}`}>{v || '—'}</span>
    </div>
  )
}

/** Enlace de acción en línea (mismo acento que "Ver" del historial). */
export function Enlace({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="text-[12.5px] font-medium text-accent hover:underline disabled:opacity-45">
      {children}
    </button>
  )
}

export function Etiqueta({ tono, children }: { tono: StatusTone; children: ReactNode }) {
  return <StatusBadge tone={tono}>{children}</StatusBadge>
}

/**
 * Paso numerado de una ventana de Acciones (#131: ① Archivos → ② Qué cubre → ③ Confirmar, y ① Quién → ② Cuánto → ③ Reparto).
 * `hecho` cambia el número por una palomita en tono ok; `derecha` es una acción o dato alineado a la derecha del título.
 */
export function Paso({ n, titulo, hecho = false, derecha, children }: { n: number; titulo: string; hecho?: boolean; derecha?: ReactNode; children?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={titulo}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold text-ink">
        <span className="flex items-center gap-2">
          <span
            className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${hecho ? 'bg-approved-bg text-approved-fg' : 'bg-accent text-accent-ink'}`}
            aria-hidden="true"
          >
            {hecho ? <Icon name="check" size={12} strokeWidth={3} /> : n}
          </span>
          {titulo}
        </span>
        {derecha && <span className="ml-auto flex items-center gap-3 font-medium">{derecha}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * Resultado del cuadre (paso ③ de Subir factura): verde si cuadra, acento si no. Solo presenta lo que calcula SQL
 * (`factura_cuadre`); `resumen` es el dato de la derecha ("Suma · XML $359,600.00") y `accion` un atajo opcional.
 */
export function IndicadorCuadre({ cuadra, titulo, detalle, resumen, accion }: { cuadra: boolean; titulo: ReactNode; detalle?: ReactNode; resumen?: ReactNode; accion?: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center gap-3.5 rounded-panel border px-4 py-3 ${cuadra ? 'border-transparent bg-approved-bg text-approved-fg' : 'border-accent/35 bg-accent/[0.07] text-accent'}`}>
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-card/60">
        <Icon name={cuadra ? 'check' : 'warning'} size={cuadra ? 14 : 15} strokeWidth={cuadra ? 3 : 2} />
      </span>
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="text-[13.5px] font-semibold">{titulo}</div>
        {detalle && <div className="text-[12.5px] leading-normal">{detalle}</div>}
      </div>
      {resumen && <div className="text-right text-[12.5px] tabular-nums">{resumen}</div>}
      {accion}
    </div>
  )
}

/** Barra de una lista con casillas: "4 de 6 marcadas · $359,600.00" y selección masiva. */
export function BarraSeleccion({ resumen, onTodas, onNinguna, etiquetaTodas = 'Marcar todas', etiquetaNinguna = 'Quitar todas' }: { resumen: ReactNode; onTodas: () => void; onNinguna: () => void; etiquetaTodas?: string; etiquetaNinguna?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline bg-row-alt px-3.5 py-2 text-[12.5px] text-subtext">
      <span className="text-ink" aria-live="polite">
        {resumen}
      </span>
      <span className="ml-auto flex gap-3">
        <Enlace onClick={onTodas}>{etiquetaTodas}</Enlace>
        <Enlace onClick={onNinguna}>{etiquetaNinguna}</Enlace>
      </span>
    </div>
  )
}

/** Cuerpo de las ventanas de Acciones: igual que Generar orden (820px / hoja al 92%). */
export const CUERPO_VENTANA = 'flex flex-col gap-4 [&>*]:shrink-0 px-4 pb-6 pt-4 md:px-[22px] md:pt-5'

/** Pie fijo de una ventana: resumen a la izquierda, monto grande a la derecha y botones (el de `GenerarOrden`). */
export function PieVentana({
  titulo,
  detalle,
  etiquetaMonto,
  monto,
  botones,
  tonoDetalle = 'neutro',
}: {
  titulo: ReactNode
  detalle: ReactNode
  /** Color de la línea de detalle: `ok` (cuadra) o `acento` (falta algo). */
  tonoDetalle?: 'neutro' | 'ok' | 'acento'
  etiquetaMonto?: string
  monto?: ReactNode
  botones: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:flex-wrap md:items-center md:gap-x-5 md:px-[22px]">
      <div className="flex items-end justify-between gap-3 md:min-w-[340px] md:flex-1">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-ink md:truncate">{titulo}</div>
          <div className={`mt-0.5 text-[11.5px] ${tonoDetalle === 'ok' ? 'text-approved-fg' : tonoDetalle === 'acento' ? 'text-accent' : 'text-subtext'}`} aria-live="polite">
            {detalle}
          </div>
        </div>
        {monto !== undefined && (
          <div className="text-right md:ml-auto">
            {etiquetaMonto && <div className="text-[11.5px] text-subtext">{etiquetaMonto}</div>}
            <div className="text-[22px] font-bold text-ink">{monto}</div>
          </div>
        )}
      </div>
      {/* Los botones no se parten en dos líneas ni se aprietan: si no caben junto al total, bajan a su propia fila (ventana de 736–820 px). */}
      <div className="flex gap-2.5 md:ml-auto md:flex-none md:[&>*]:whitespace-nowrap">{botones}</div>
    </div>
  )
}
