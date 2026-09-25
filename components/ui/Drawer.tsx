'use client'

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useOverlay } from '@/components/ui/useOverlay'

interface DrawerProps {
  onClose: () => void
  title: ReactNode
  /** Texto del botón de regreso en móvil ("‹ Cuentas"). */
  backLabel: string
  /** Fila fija debajo del título (pestañas en escritorio). */
  toolbar?: ReactNode
  children: ReactNode
}

/**
 * Panel lateral derecho de 400px en escritorio (fondo rgba(0,0,0,.16)) y
 * pantalla empujada en móvil, con "‹ <backLabel>" arriba (S10).
 */
export function Drawer({ onClose, title, backLabel, toolbar, children }: DrawerProps) {
  useOverlay(onClose)
  return (
    <div className="fixed inset-0 z-50 md:bg-black/[.16]" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="absolute inset-0 flex flex-col bg-app md:left-auto md:w-[400px] md:max-w-full md:border-l md:border-hairline md:bg-card md:shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none flex-col px-4 pt-[max(8px,env(safe-area-inset-top))] md:hidden">
          <button type="button" onClick={onClose} className="-ml-1.5 flex h-[30px] items-center gap-0.5 self-start text-[15px] text-accent">
            <Icon name="chevron-left" size={22} />
            {backLabel}
          </button>
          <div className="sn-display flex min-h-[44px] items-center text-[27px] text-ink">{title}</div>
        </div>
        <div className="hidden flex-none items-center justify-between px-5 pb-3.5 pt-[18px] md:flex">
          <div className="text-[17px] font-semibold text-ink">{title}</div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="flex p-1 text-subtext hover:text-body">
            <Icon name="close" size={18} />
          </button>
        </div>
        {toolbar && <div className="flex flex-none border-b border-hairline px-5 pb-3.5 max-md:hidden">{toolbar}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-5">{children}</div>
      </aside>
    </div>
  )
}
