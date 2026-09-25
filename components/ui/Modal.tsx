'use client'

import { useId, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useOverlay } from '@/components/ui/useOverlay'

type ModalSize = 'lg' | '3xl' | '780' | '820' | '960'

interface ModalProps {
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** Texto chico en accent arriba del título (detalle de cuenta). */
  eyebrow?: ReactNode
  size?: ModalSize
  headerExtra?: ReactNode
  /** Bloque fijo debajo del título (chip, avance, pestañas); no hace scroll. */
  header?: ReactNode
  /** Pie fijo abajo; el cuerpo hace scroll por encima de él. */
  footer?: ReactNode
  /** En móvil (< md) se pinta como hoja inferior con grabber y fondo .28. */
  mobile?: 'sheet'
  /** Alto de la hoja móvil (88% en el detalle, 92% en generar orden). */
  sheetHeight?: '88%' | '92%'
  /** Escape cierra y el fondo no hace scroll. Los modales viejos no lo activan. */
  closeOnEscape?: boolean
  /** Reemplaza el padding y el espaciado por default del cuerpo. */
  bodyClassName?: string
  children: ReactNode
}

const SIZE_CLASS: Record<ModalSize, string> = {
  lg: 'max-w-lg max-h-[80vh]',
  '3xl': 'max-w-3xl max-h-[90vh]',
  '780': 'max-w-[780px] max-h-[90vh]',
  '820': 'max-w-[820px] max-h-[90vh]',
  '960': 'max-w-[960px] max-h-[90vh]',
}

// Primitivo compartido (Fase 5.2 Bloque 3). El Rediseño de Cuentas (S10) le
// agrega, sin cambiar los usos actuales: tamaños 780/820/960, eyebrow,
// slots `header` y `footer` (fijo abajo), Escape y hoja móvil.
export function Modal({
  onClose,
  title,
  subtitle,
  eyebrow,
  size = 'lg',
  headerExtra,
  header,
  footer,
  mobile,
  sheetHeight = '88%',
  closeOnEscape = false,
  bodyClassName,
  children,
}: ModalProps) {
  useOverlay(onClose, closeOnEscape)
  const tituloId = useId()
  const sheet = mobile === 'sheet'

  const overlay = sheet
    ? 'items-end bg-black/[.28] p-0 md:items-center md:bg-black/60 md:p-4'
    : 'items-center bg-black/60 p-4'
  const panel = sheet
    ? `rounded-t-[14px] ${sheetHeight === '92%' ? 'h-[92%]' : 'h-[88%]'} md:h-auto md:rounded-panel md:border`
    : 'rounded-panel border'

  return (
    <div className={`fixed inset-0 z-50 flex justify-center ${overlay}`} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`flex w-full flex-col overflow-hidden border-hairline bg-card shadow-overlay ${SIZE_CLASS[size]} ${panel}`}
        onClick={(e) => e.stopPropagation()}
      >
        {sheet && (
          <div className="flex flex-none justify-center pb-0.5 pt-[7px] md:hidden">
            <span className="h-[5px] w-9 rounded-[3px] bg-hairline" />
          </div>
        )}
        <div className={`flex-none border-b border-hairline ${sheet ? 'px-4 pb-3 pt-1.5 md:px-[22px] md:pb-4 md:pt-5' : 'p-4 md:p-6'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {eyebrow && <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-accent">{eyebrow}</div>}
              <div className="flex items-center gap-2">
                <h2 id={tituloId} className={`font-bold text-ink ${eyebrow ? 'mt-[3px] text-[17px]' : 'text-h3'}`}>{title}</h2>
                {headerExtra}
              </div>
              {subtitle && <p className="mt-1 text-subtext text-content">{subtitle}</p>}
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className={
                sheet
                  ? 'flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-row-alt text-subtext md:bg-transparent'
                  : 'flex-none text-subtext transition-colors hover:text-body'
              }
            >
              <Icon name="close" size={sheet ? 16 : 20} />
            </button>
          </div>
          {header && <div className="mt-2.5">{header}</div>}
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName ?? 'space-y-4 p-4 md:p-6'}`}>{children}</div>
        {footer && <div className="flex-none border-t border-hairline bg-card">{footer}</div>}
      </div>
    </div>
  )
}
