'use client'

import type { LineElement, PdfElement, PdfPage } from '@/lib/server/pdf/pdf-template-schema'
import { ColorSwatchPopover } from './shared/ColorSwatchPopover'
import { PositionPopover } from './shared/PositionPopover'
import { DeleteButton } from './shared/DeleteButton'

interface LineToolbarProps {
  element: LineElement
  elements: PdfElement[]
  page: PdfPage
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onDelete: () => void
}

export function LineToolbar({ element, elements, page, onChangeElements, onDelete }: LineToolbarProps) {
  function update(patch: Partial<LineElement>) {
    onChangeElements(els => els.map(el => (el.id === element.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <label className="flex flex-none items-center gap-1.5 rounded-control border border-hairline bg-input px-2 text-[length:var(--text-sm)] text-body">
        Grosor
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={element.weight}
          onChange={e => update({ weight: Number(e.target.value) })}
          className="h-[30px] w-14 bg-transparent text-center outline-none"
        />
        mm
      </label>
      <ColorSwatchPopover value={element.colorToken} onChange={token => update({ colorToken: token })} />
      <div className="mx-1 h-6 w-px flex-none bg-hairline" />
      <PositionPopover element={element} elements={elements} page={page} onChangeElements={onChangeElements} />
      <DeleteButton elements={[element]} onDelete={onDelete} />
    </div>
  )
}
