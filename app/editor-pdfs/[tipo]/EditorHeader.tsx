'use client'

import { Button } from '@/components/ui/Button'

interface EditorHeaderProps {
  tipoLabel: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onPreview: () => void
  onDescartar: () => void
  onRestaurar: () => void
  onAplicar: () => void
}

/**
 * Header permanente del Editor de PDFs (Bloque 11.1, docs/PLAN.md) -- nunca
 * cambia con la selección, a diferencia de `ContextualToolbar.tsx`. Acciones
 * de documento completo (Vista previa, Descartar, Restaurar, Aplicar diseño)
 * -- "Aplicar diseño" vive acá a propósito y nunca en la toolbar contextual
 * (regla confirmada con el usuario). Deshacer/Rehacer (Bloque 11.3) se
 * agregan acá también, mismo motivo: son acciones de documento, no de
 * elemento.
 */
export function EditorHeader({ tipoLabel, saveStatus, onPreview, onDescartar, onRestaurar, onAplicar }: EditorHeaderProps) {
  return (
    <div className="flex min-h-[52px] flex-none flex-wrap items-center gap-4 rounded-panel border border-hairline bg-card px-4 py-2.5">
      <div className="flex items-center gap-2 whitespace-nowrap text-[length:var(--text-md)] text-subtext">
        <span>Editor de PDFs</span>
        <span className="text-faint">/</span>
        <span className="font-semibold text-ink">{tipoLabel}</span>
      </div>

      <div className="ml-auto flex flex-none items-center gap-3">
        <span className="text-[length:var(--text-sm)] text-subtext">
          {saveStatus === 'saving' && 'Guardando…'}
          {saveStatus === 'saved' && 'Guardado'}
          {saveStatus === 'error' && 'Error al guardar'}
        </span>
        <Button variant="ghost" size="md" onClick={onPreview}>Vista previa</Button>
        <Button variant="ghost" size="md" onClick={onDescartar}>Descartar cambios</Button>
        <Button variant="ghost" size="md" onClick={onRestaurar}>Restaurar plantilla</Button>
        <Button variant="primary" size="md" onClick={onAplicar}>Aplicar diseño</Button>
      </div>
    </div>
  )
}
