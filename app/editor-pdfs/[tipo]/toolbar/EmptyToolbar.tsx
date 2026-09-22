'use client'

import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { TextField } from '@/components/ui/TextField'
import { Popover } from '@/components/ui/Popover'
import { Icon } from '@/components/ui/Icon'
import { stepZoom, ZOOM_MAX, ZOOM_MIN } from '../geometry'

interface EmptyToolbarProps {
  template: PdfTemplate
  onChangeTemplate: (updater: (template: PdfTemplate) => PdfTemplate) => void
  snapGrid: number
  onChangeSnapGrid: (grid: number) => void
  zoom: number
  onChangeZoom: (zoom: number) => void
  onFitToPage: () => void
}

/**
 * Toolbar cuando no hay selección (Bloque 11.1/11.4, docs/PLAN.md): snap
 * grid, zoom (mínimo viable: +/-, 100%, ajustar a página) + popover
 * "Ajustes de página" (4 márgenes).
 */
export function EmptyToolbar({ template, onChangeTemplate, snapGrid, onChangeSnapGrid, zoom, onChangeZoom, onFitToPage }: EmptyToolbarProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
      <label className="flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] text-body">
        Snap
        <input
          type="number"
          min={0}
          value={snapGrid}
          onChange={e => onChangeSnapGrid(Number(e.target.value))}
          className="h-full w-12 bg-transparent text-center outline-none"
        />
        mm
      </label>

      <div className="mx-1 h-6 w-px flex-none bg-hairline" />

      <div className="flex flex-none items-center gap-1 rounded-control border border-hairline bg-input px-1">
        <button
          type="button"
          aria-label="Alejar"
          disabled={zoom <= ZOOM_MIN}
          onClick={() => onChangeZoom(stepZoom(zoom, -1))}
          className="flex h-[26px] w-6 items-center justify-center text-subtext hover:text-body disabled:opacity-30"
        >
          <Icon name="chevron-left" size={13} />
        </button>
        <span className="w-11 text-center text-[length:var(--text-sm)] text-body">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Acercar"
          disabled={zoom >= ZOOM_MAX}
          onClick={() => onChangeZoom(stepZoom(zoom, 1))}
          className="flex h-[26px] w-6 items-center justify-center text-subtext hover:text-body disabled:opacity-30"
        >
          <Icon name="chevron-right" size={13} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onChangeZoom(1)}
        className="flex h-[30px] flex-none items-center whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] text-body hover:bg-row-alt"
      >
        100%
      </button>
      <button
        type="button"
        onClick={onFitToPage}
        className="flex h-[30px] flex-none items-center whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] text-body hover:bg-row-alt"
      >
        Ajustar a página
      </button>

      <div className="mx-1 h-6 w-px flex-none bg-hairline" />

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
            Ajustes de página <Icon name="chevron-down" size={13} />
          </button>
        )}
        panelClassName="w-[260px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised z-20"
      >
        <div className="grid grid-cols-2 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map(side => (
            <TextField
              key={side}
              label={`Margen ${side} (mm)`}
              type="number"
              value={template.page.margins[side]}
              onChange={e =>
                onChangeTemplate(t => ({ ...t, page: { ...t.page, margins: { ...t.page.margins, [side]: Number(e.target.value) } } }))
              }
            />
          ))}
        </div>
      </Popover>
    </div>
  )
}
