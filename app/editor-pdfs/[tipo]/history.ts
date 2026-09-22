import { useState } from 'react'
import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'

const HISTORY_LIMIT = 50

interface EditorHistoryState {
  past: PdfTemplate[]
  present: PdfTemplate | null
  future: PdfTemplate[]
}

export interface EditorHistory {
  present: PdfTemplate | null
  /** Un cambio real del usuario -- entra al historial (undo lo revierte). */
  commit: (next: PdfTemplate) => void
  /** Reemplaza `present` sin generar entrada de historial -- carga inicial, Aplicar/Descartar/Restaurar. */
  reset: (next: PdfTemplate) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

/**
 * Historial de undo/redo real (Bloque 11.3, docs/PLAN.md) -- envuelve el
 * chokepoint único que ya era `updateTemplate` en `page.tsx`. El Bloque 11.2
 * (manipulación directa transaccional) ya garantiza un `commit()` por
 * gesto/edición completa, así que cada entrada del historial ya es una
 * acción semántica completa, no un paso intermedio.
 *
 * `onChange` se dispara con el `present` resultante de `commit()`/`undo()`/
 * `redo()` (nunca de `reset()`) -- `page.tsx` lo usa para disparar
 * `scheduleAutosave()` en los tres casos, sin duplicar la llamada.
 */
export function useEditorHistory(onChange?: (next: PdfTemplate) => void): EditorHistory {
  const [state, setState] = useState<EditorHistoryState>({ past: [], present: null, future: [] })

  function commit(next: PdfTemplate) {
    setState(s =>
      s.present === null
        ? { past: [], present: next, future: [] }
        : { past: [...s.past, s.present].slice(-HISTORY_LIMIT), present: next, future: [] }
    )
    onChange?.(next)
  }

  function reset(next: PdfTemplate) {
    setState({ past: [], present: next, future: [] })
  }

  function undo() {
    if (state.past.length === 0 || state.present === null) return
    const previous = state.past[state.past.length - 1]
    setState({ past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] })
    onChange?.(previous)
  }

  function redo() {
    if (state.future.length === 0 || state.present === null) return
    const [next, ...rest] = state.future
    setState({ past: [...state.past, state.present], present: next, future: rest })
    onChange?.(next)
  }

  return { present: state.present, commit, reset, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }
}
