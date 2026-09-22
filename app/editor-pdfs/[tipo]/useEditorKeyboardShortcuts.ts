import { useEffect } from 'react'
import type { PdfElement } from '@/lib/server/pdf/pdf-template-schema'
import { selectionIds, type EditorSelection } from './selection'

interface UseEditorKeyboardShortcutsArgs {
  selection: EditorSelection
  elements: PdfElement[]
  onSelect: (ids: string[]) => void
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onUndo: () => void
  onRedo: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

const ARROW_DELTA: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
}

/**
 * Atajos de teclado del Editor de PDFs (Bloque 11.3, docs/PLAN.md):
 * Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z / Ctrl+Y (redo), Cmd/Ctrl+A (selecciona
 * todo lo no-sticky), Delete/Backspace (borra selección no-`required`),
 * flechas (nudge 1mm, Shift = 5mm). Undo/redo siempre activos; el resto
 * respeta la guarda de foco: no actúan si el foco está en un input/
 * textarea/contentEditable (evita interceptar edición de texto nativa --
 * incluida la del propio `TextEditOverlay.tsx`, que maneja su Escape
 * localmente). `e.repeat` se ignora en flechas para que mantener la tecla
 * apretada no dispare un commit por cada evento de auto-repeat del SO --
 * "cada nudge completo es un commit, no continuo".
 */
export function useEditorKeyboardShortcuts({
  selection,
  elements,
  onSelect,
  onChangeElements,
  onUndo,
  onRedo,
}: UseEditorKeyboardShortcutsArgs) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        onRedo()
        return
      }

      if (isEditableTarget(e.target)) return

      const selectedIds = selectionIds(selection)

      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        onSelect(elements.filter(el => el.sticky === undefined).map(el => el.id))
        return
      }

      if (e.key === 'Escape') {
        if (selectedIds.length > 0) onSelect([])
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        const deletable = elements.filter(el => selectedIds.includes(el.id) && !el.required)
        if (deletable.length === 0) return
        const deletableIds = new Set(deletable.map(el => el.id))
        onChangeElements(els => els.filter(el => !deletableIds.has(el.id)))
        onSelect([])
        return
      }

      const arrow = ARROW_DELTA[e.key]
      if (arrow && selectedIds.length > 0) {
        e.preventDefault()
        if (e.repeat) return
        const step = e.shiftKey ? 5 : 1
        const dx = arrow.dx * step
        const dy = arrow.dy * step
        onChangeElements(els =>
          els.map(el =>
            selectedIds.includes(el.id) ? { ...el, x: el.x + dx, y: el.flowAfter !== undefined ? el.y : el.y + dy } : el
          )
        )
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection, elements, onSelect, onChangeElements, onUndo, onRedo])
}
