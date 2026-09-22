'use client'

import { useState } from 'react'
import type { PdfElement, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { COLOR_TOKENS } from '@/lib/server/pdf/pdf-color-tokens'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { alignToPage, bringToFront, sendToBack, type AlignMode } from './geometry'

interface ToolbarProps {
  tipoLabel: string
  template: PdfTemplate
  selectedIds: string[]
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  onPreview: () => void
  onDescartar: () => void
  onRestaurar: () => void
  onAplicar: () => void
}

const ALIGN_PAGE_BUTTONS: { mode: AlignMode; icon: IconName; label: string }[] = [
  { mode: 'left', icon: 'align-h-start', label: 'Izquierda' },
  { mode: 'center-h', icon: 'align-h-center', label: 'Centro horizontal' },
  { mode: 'right', icon: 'align-h-end', label: 'Derecha' },
  { mode: 'top', icon: 'align-v-start', label: 'Arriba' },
  { mode: 'center-v', icon: 'align-v-center', label: 'Centro vertical' },
  { mode: 'bottom', icon: 'align-v-end', label: 'Abajo' },
]

/**
 * Toolbar contextual del Editor de PDFs (docs/PLAN.md, Bloque 7 --
 * rediseño del lienzo): acceso rápido a lo que antes vivía solo en el
 * panel de propiedades de Inspector.tsx (tamaño/negrita/alinear/color para
 * texto, orden de capas). El panel de propiedades sigue existiendo para
 * todo lo demás (flujo, tablas, banner de totales) -- esto es un atajo,
 * no un reemplazo.
 */
export function Toolbar({
  tipoLabel,
  template,
  selectedIds,
  onChangeElements,
  saveStatus,
  onPreview,
  onDescartar,
  onRestaurar,
  onAplicar,
}: ToolbarProps) {
  const [openPanel, setOpenPanel] = useState<'color' | 'position' | null>(null)

  const selected = template.elements.filter(el => selectedIds.includes(el.id))
  const single = selected.length === 1 ? selected[0] : null

  function updateSingle(patch: Partial<PdfElement>) {
    if (!single) return
    onChangeElements(elements => elements.map(el => (el.id === single.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  return (
    <div className="flex min-h-[52px] flex-none flex-wrap items-center gap-4 rounded-panel border border-hairline bg-card px-4 py-2.5">
      <div className="flex items-center gap-2 whitespace-nowrap text-[length:var(--text-md)] text-subtext">
        <span>Editor de PDFs</span>
        <span className="text-faint">/</span>
        <span className="font-semibold text-ink">{tipoLabel}</span>
      </div>

      {single && (single.type === 'text' || single.type === 'line' || single.type === 'image') && (
        <>
          <div className="h-6 w-px flex-none bg-hairline" />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {single.type === 'text' && (
              <TextToolbarControls single={single} updateSingle={updateSingle} />
            )}
            {single.type === 'line' && (
              <ToolbarButton
                active
                onClick={() => {}}
              >
                <Icon name="minus" size={16} /> Línea
              </ToolbarButton>
            )}
            {single.type === 'image' && (
              <div className="flex gap-1">
                <ToolbarButton active={single.src === 'logo-iso'} onClick={() => updateSingle({ src: 'logo-iso' })}>
                  Logo ISO
                </ToolbarButton>
                <ToolbarButton active={single.src === 'logo-serenata'} onClick={() => updateSingle({ src: 'logo-serenata' })}>
                  Logo Serenata
                </ToolbarButton>
              </div>
            )}

            {(single.type === 'text' || single.type === 'line') && (
              <>
                <div className="mx-1 h-6 w-px flex-none bg-hairline" />
                <div className="relative flex-none">
                  <ToolbarButton
                    active={openPanel === 'color'}
                    onClick={() => setOpenPanel(p => (p === 'color' ? null : 'color'))}
                  >
                    <span
                      className="h-4 w-4 flex-none rounded-full border-2 border-ink"
                      style={{ backgroundColor: rgbCss(COLOR_TOKENS[single.colorToken]) }}
                    />
                    Color
                  </ToolbarButton>
                  {openPanel === 'color' && (
                    <ColorPopover
                      value={single.colorToken}
                      onChange={token => {
                        updateSingle({ colorToken: token })
                        setOpenPanel(null)
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          <div className="h-6 w-px flex-none bg-hairline" />
          <div className="relative flex-none">
            <ToolbarButton active={openPanel === 'position'} onClick={() => setOpenPanel(p => (p === 'position' ? null : 'position'))}>
              Posición <Icon name="chevron-down" size={13} />
            </ToolbarButton>
            {openPanel === 'position' && (
              <PositionPopover
                onBringToFront={() => {
                  onChangeElements(els => bringToFront(els, single.id))
                  setOpenPanel(null)
                }}
                onSendToBack={() => {
                  onChangeElements(els => sendToBack(els, single.id))
                  setOpenPanel(null)
                }}
                onAlign={mode => {
                  onChangeElements(els => alignToPage(els, mode, template.page))
                  setOpenPanel(null)
                }}
              />
            )}
          </div>
        </>
      )}

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

function TextToolbarControls({
  single,
  updateSingle,
}: {
  single: Extract<PdfElement, { type: 'text' }>
  updateSingle: (patch: Partial<PdfElement>) => void
}) {
  return (
    <>
      <div className="flex flex-none items-center gap-1 rounded-control border border-hairline bg-input px-2">
        <button
          type="button"
          className="text-subtext hover:text-body"
          aria-label="Reducir tamaño"
          onClick={() => updateSingle({ size: Math.max(4, single.size - 0.5) })}
        >
          <Icon name="chevron-left" size={13} />
        </button>
        <span className="w-8 text-center text-[length:var(--text-sm)] text-body">{single.size}</span>
        <button
          type="button"
          className="text-subtext hover:text-body"
          aria-label="Aumentar tamaño"
          onClick={() => updateSingle({ size: single.size + 0.5 })}
        >
          <Icon name="chevron-right" size={13} />
        </button>
      </div>

      <ToolbarButton active={single.bold} onClick={() => updateSingle({ bold: !single.bold })} aria-label="Negrita">
        <Icon name="bold" size={16} />
      </ToolbarButton>
      <ToolbarButton active={single.upper ?? false} onClick={() => updateSingle({ upper: !single.upper })} aria-label="Mayúsculas">
        <Icon name="case-sensitive" size={16} />
      </ToolbarButton>

      <div className="flex flex-none overflow-hidden rounded-control border border-hairline">
        {(
          [
            ['left', 'align-left'],
            ['center', 'align-center'],
            ['right', 'align-right'],
            ['justify', 'align-justify'],
          ] as const
        ).map(([mode, icon]) => (
          <button
            key={mode}
            type="button"
            aria-label={`Alinear ${mode}`}
            onClick={() => updateSingle({ align: mode })}
            className={`flex h-[30px] w-8 items-center justify-center border-r border-hairline last:border-r-0 ${
              single.align === mode ? 'bg-accent-tint text-accent' : 'text-subtext hover:bg-row-alt'
            }`}
          >
            <Icon name={icon} size={15} />
          </button>
        ))}
      </div>
    </>
  )
}

function ToolbarButton({
  active,
  onClick,
  children,
  ...rest
}: { active?: boolean; onClick: () => void; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] transition-colors ${
        active ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row-alt'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}

function ColorPopover({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  return (
    <div className="absolute left-0 top-[38px] z-20 w-[260px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised">
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
            <span
              className={`h-6 w-6 rounded-full border-2 ${value === token ? 'border-accent' : 'border-hairline'}`}
              style={{ backgroundColor: rgbCss(rgb) }}
            />
            <span className="truncate text-[9px] text-subtext">{token}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PositionPopover({
  onBringToFront,
  onSendToBack,
  onAlign,
}: {
  onBringToFront: () => void
  onSendToBack: () => void
  onAlign: (mode: AlignMode) => void
}) {
  return (
    <div className="absolute right-0 top-[38px] z-20 w-[220px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised">
      <div className="sn-label mb-2">Orden</div>
      <div className="mb-3 flex gap-1.5">
        <Button variant="secondary" size="md" iconLeft="bring-to-front" onClick={onBringToFront} className="flex-1">
          Al frente
        </Button>
        <Button variant="secondary" size="md" iconLeft="send-to-back" onClick={onSendToBack} className="flex-1">
          Al fondo
        </Button>
      </div>
      <div className="sn-label mb-2">Alinear a página</div>
      <div className="grid grid-cols-3 gap-1.5">
        {ALIGN_PAGE_BUTTONS.map(btn => (
          <button
            key={btn.mode}
            type="button"
            aria-label={btn.label}
            onClick={() => onAlign(btn.mode)}
            className="flex h-8 items-center justify-center rounded-control border border-hairline text-subtext hover:bg-row-alt hover:text-body"
          >
            <Icon name={btn.icon} size={15} />
          </button>
        ))}
      </div>
    </div>
  )
}

function rgbCss(rgb: [number, number, number] | undefined): string {
  if (!rgb) return 'transparent'
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}
