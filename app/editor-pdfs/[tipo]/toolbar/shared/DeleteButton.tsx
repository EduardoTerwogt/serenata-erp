'use client'

import { Button } from '@/components/ui/Button'
import type { PdfElement } from '@/lib/server/pdf/pdf-template-schema'

interface DeleteButtonProps {
  elements: PdfElement[]
  onDelete: () => void
}

/** Botón "Eliminar" compartido entre toolbars y `LayersPanel.tsx` -- deshabilitado si todo lo seleccionado es `required`. */
export function DeleteButton({ elements, onDelete }: DeleteButtonProps) {
  return (
    <Button variant="ghost" size="md" onClick={onDelete} disabled={elements.every(el => el.required)}>
      Eliminar
    </Button>
  )
}
