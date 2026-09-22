'use client'

import { Popover } from '@/components/ui/Popover'
import { COLOR_TOKENS } from '@/lib/server/pdf/pdf-color-tokens'

interface ColorSwatchPopoverProps {
  value: string
  onChange: (token: string) => void
  label?: string
}

function rgbCss(rgb: [number, number, number] | undefined): string {
  if (!rgb) return 'transparent'
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}

/** Swatch de color con popover de tokens `--sn-*` -- usado por Text/Line/TotalsBanner toolbars. */
export function ColorSwatchPopover({ value, onChange, label = 'Color' }: ColorSwatchPopoverProps) {
  return (
    <Popover
      trigger={({ onClick, ref, 'aria-expanded': expanded }) => (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          aria-expanded={expanded}
          aria-label={label}
          className={`flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] transition-colors ${
            expanded ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row-alt'
          }`}
        >
          <span className="h-4 w-4 flex-none rounded-full border-2 border-ink" style={{ backgroundColor: rgbCss(COLOR_TOKENS[value]) }} />
          {label}
        </button>
      )}
      panelClassName="w-[260px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised z-20"
    >
      <div className="sn-label mb-2.5">Tokens --sn-*</div>
      <div className="grid grid-cols-5 gap-x-2 gap-y-3">
        {Object.entries(COLOR_TOKENS).map(([token, rgb]) => (
          <button
            key={token}
            type="button"
            onClick={() => onChange(token)}
            className="flex flex-col items-center gap-1.5"
            aria-label={token}
          >
            <span className={`h-6 w-6 rounded-full border-2 ${value === token ? 'border-accent' : 'border-hairline'}`} style={{ backgroundColor: rgbCss(rgb) }} />
            <span className="truncate text-[9px] text-subtext">{token}</span>
          </button>
        ))}
      </div>
    </Popover>
  )
}
