'use client'

import type { ReactNode } from 'react'
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

/** Cuerpo de las ventanas de Acciones: igual que Generar orden (820px / hoja al 92%). */
export const CUERPO_VENTANA = 'flex flex-col gap-4 [&>*]:shrink-0 px-4 pb-6 pt-4 md:px-[22px] md:pt-5'

/** Pie fijo de una ventana: resumen a la izquierda, monto grande a la derecha y botones (el de `GenerarOrden`). */
export function PieVentana({
  titulo,
  detalle,
  etiquetaMonto,
  monto,
  botones,
}: {
  titulo: ReactNode
  detalle: ReactNode
  etiquetaMonto?: string
  monto?: ReactNode
  botones: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:flex-wrap md:items-center md:gap-x-5 md:px-[22px]">
      <div className="flex items-end justify-between gap-3 md:min-w-[340px] md:flex-1">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-ink">{titulo}</div>
          <div className="mt-0.5 text-[11.5px] text-subtext">{detalle}</div>
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
