'use client'

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useOverlay } from '@/components/ui/useOverlay'

interface BottomSheetProps {
  onClose: () => void
  /** Alto fijo (92% proyecto, 88% detalle); sin él, la hoja crece con su contenido. */
  height?: '88%' | '92%'
  /** Encabezado propio; sin él solo va el grabber. */
  header?: ReactNode
  /** Título simple con botón de cerrar a la derecha. */
  title?: ReactNode
  /** Acción del encabezado a la izquierda del cerrar (ej. "Limpiar"). */
  action?: ReactNode
  footer?: ReactNode
  children: ReactNode
  label?: string
}

/**
 * Hoja inferior móvil del Rediseño de Cuentas: fondo rgba(0,0,0,.28), radio
 * 14px arriba y grabber de 36×5. La usan Periodo, Filtros y el proyecto
 * abierto; `Modal mobile="sheet"` pinta la misma forma por CSS.
 */
export function BottomSheet({ onClose, height, header, title, action, footer, children, label }: BottomSheetProps) {
  useOverlay(onClose)
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/[.28]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`flex w-full flex-col overflow-hidden rounded-t-[14px] bg-card shadow-overlay ${height === '92%' ? 'h-[92%]' : height === '88%' ? 'h-[88%]' : 'max-h-[92%]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none justify-center pb-0.5 pt-[7px]">
          <span className="h-[5px] w-9 rounded-[3px] bg-hairline" />
        </div>
        {header}
        {!header && title && (
          <div className="flex flex-none items-center gap-3 px-4 pb-3 pt-2">
            <div className="min-w-0 flex-1 text-[17px] font-semibold text-ink">{title}</div>
            {action}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-row-alt text-subtext"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex-none border-t border-hairline px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  )
}
