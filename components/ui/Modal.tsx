'use client'

import { Icon } from '@/components/ui/Icon'

interface ModalProps {
  onClose: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  size?: 'lg' | '3xl'
  headerExtra?: React.ReactNode
  children: React.ReactNode
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  lg: 'max-w-lg max-h-[80vh]',
  '3xl': 'max-w-3xl max-h-[90vh]',
}

// Primitivo compartido (Fase 5.2 Bloque 3) -- replica el patrón ya usado en
// CuentaDetailModal/OrdenPagoModal/CuentasPage's ListModal, hasta ahora
// repetido a mano en cada dominio. No migra los modales existentes, solo
// evita seguir copiando el shell para los nuevos de Proyectos.
export function Modal({ onClose, title, subtitle, size = 'lg', headerExtra, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className={`bg-card border border-hairline rounded-panel w-full ${SIZE_CLASS[size]} flex flex-col shadow-overlay overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-hairline p-4 md:p-6 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-h3 font-bold text-ink">{title}</h2>
              {headerExtra}
            </div>
            {subtitle && <p className="text-subtext text-content mt-1">{subtitle}</p>}
          </div>
          <button aria-label="Cerrar" onClick={onClose} className="text-subtext hover:text-body transition-colors flex-none">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="p-4 md:p-6 space-y-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
