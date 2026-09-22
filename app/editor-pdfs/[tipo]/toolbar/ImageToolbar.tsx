'use client'

import type { ImageElement, PdfElement, PdfPage } from '@/lib/server/pdf/pdf-template-schema'
import { Popover } from '@/components/ui/Popover'
import { Icon } from '@/components/ui/Icon'
import { PositionPopover } from './shared/PositionPopover'
import { DeleteButton } from './shared/DeleteButton'

interface ImageToolbarProps {
  element: ImageElement
  elements: PdfElement[]
  page: PdfPage
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onDelete: () => void
}

const ASSET_LABEL: Record<ImageElement['src'], string> = {
  'logo-iso': 'Logo ISO',
  'logo-serenata': 'Logo Serenata',
}

export function ImageToolbar({ element, elements, page, onChangeElements, onDelete }: ImageToolbarProps) {
  function update(patch: Partial<ImageElement>) {
    onChangeElements(els => els.map(el => (el.id === element.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <Popover
        trigger={({ onClick, ref, 'aria-expanded': expanded }) => (
          <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-expanded={expanded}
            className={`flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] transition-colors ${
              expanded ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row-alt'
            }`}
          >
            <Icon name="image" size={16} /> {ASSET_LABEL[element.src]} <Icon name="chevron-down" size={13} />
          </button>
        )}
        panelClassName="w-[200px] rounded-panel border border-hairline bg-card p-2 shadow-raised z-20"
      >
        <div className="flex flex-col gap-1">
          {(Object.keys(ASSET_LABEL) as ImageElement['src'][]).map(src => (
            <button
              key={src}
              type="button"
              onClick={() => update({ src })}
              className={`rounded-control px-2 py-1.5 text-left text-[length:var(--text-sm)] ${
                element.src === src ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row-alt'
              }`}
            >
              {ASSET_LABEL[src]}
            </button>
          ))}
        </div>
      </Popover>
      <div className="mx-1 h-6 w-px flex-none bg-hairline" />
      <PositionPopover element={element} elements={elements} page={page} onChangeElements={onChangeElements} />
      <DeleteButton elements={[element]} onDelete={onDelete} />
    </div>
  )
}
