'use client'

import { useEffect, useRef } from 'react'
import type { TextElement } from '@/lib/server/pdf/pdf-template-schema'
import { textElementStyle, textOuterWrapperStyle } from './text-style'

interface TextEditOverlayProps {
  element: TextElement
  onCommit: (text: string) => void
  onCancel: () => void
}

/**
 * Edición directa de texto in-place (Bloque 11.2, docs/PLAN.md) -- entra por
 * doble-click en `EditorCanvas.tsx`. Reusa literalmente `textElementStyle`/
 * `textOuterWrapperStyle` (mismas que el render estático) para que se vea
 * IDÉNTICO al texto estático, sin repetir el bug de mismatch de métricas de
 * `82e59a2`. `contentEditable` (no `<textarea>`) porque respeta
 * `text-align`/wrapping visual igual que el `<div>` estático.
 *
 * No controlado por React a propósito: el texto vive en el DOM
 * (`el.textContent`) mientras se edita, se lee una sola vez al confirmar --
 * evita los problemas conocidos de contentEditable controlado (cursor que
 * salta) y hace trivial que Escape revierta sin tocar el modelo.
 */
export function TextEditOverlay({ element, onCommit, onCancel }: TextEditOverlayProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.textContent = element.text
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function commit() {
    onCommit(ref.current?.textContent ?? '')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
      return
    }
    if (e.key === 'Enter' && !element.wrap) {
      e.preventDefault()
      commit()
    }
  }

  return (
    <div style={textOuterWrapperStyle(element)}>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onPointerDown={e => e.stopPropagation()}
        style={{ ...textElementStyle(element), outline: 'none' }}
      />
    </div>
  )
}
