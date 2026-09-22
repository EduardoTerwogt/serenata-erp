'use client'

import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { TextField } from '@/components/ui/TextField'
import { Popover } from '@/components/ui/Popover'
import { Icon } from '@/components/ui/Icon'

interface EmptyToolbarProps {
  template: PdfTemplate
  onChangeTemplate: (updater: (template: PdfTemplate) => PdfTemplate) => void
  snapGrid: number
  onChangeSnapGrid: (grid: number) => void
}

/**
 * Toolbar cuando no hay selección (Bloque 11.1, docs/PLAN.md): snap grid +
 * popover "Ajustes de página" (4 márgenes). Controles de zoom llegan en el
 * Bloque 11.4 -- no se agregan acá todavía.
 */
export function EmptyToolbar({ template, onChangeTemplate, snapGrid, onChangeSnapGrid }: EmptyToolbarProps) {
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
