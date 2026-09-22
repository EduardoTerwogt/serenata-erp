'use client'

import { Popover } from '@/components/ui/Popover'
import { Icon, type IconName } from '@/components/ui/Icon'
import { TextField } from '@/components/ui/TextField'
import { Select } from '@/components/ui/Select'
import type { PdfElement, PdfPage } from '@/lib/server/pdf/pdf-template-schema'
import { alignToPage, bringToFront, layerLabel, sendToBack, type AlignMode } from '../../geometry'
import { LayerOrderButtons } from './LayerOrderButtons'

interface PositionPopoverProps {
  element: PdfElement
  elements: PdfElement[]
  page: PdfPage
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
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
 * Popover "Posición" -- agrupa todo lo espacial de un elemento: orden de
 * capas, alinear a página, X/Y/W/H y Flujo (flowAfter/flowGap/visibleIf).
 * Usado por todas las toolbars de un solo elemento (Text/Line/Image/Table/
 * TotalsBanner) -- ver tabla de destino de campos en docs/PLAN.md, Bloque 11.
 */
export function PositionPopover({ element, elements, page, onChangeElements }: PositionPopoverProps) {
  function update(patch: Partial<PdfElement>) {
    onChangeElements(els => els.map(el => (el.id === element.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  return (
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
          Posición <Icon name="chevron-down" size={13} />
        </button>
      )}
      placement="bottom-end"
      panelClassName="w-[260px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised z-20"
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="sn-label mb-2">Orden</div>
          <LayerOrderButtons
            onBringToFront={() => onChangeElements(els => bringToFront(els, element.id))}
            onSendToBack={() => onChangeElements(els => sendToBack(els, element.id))}
          />
        </div>

        <div>
          <div className="sn-label mb-2">Alinear a página</div>
          <div className="grid grid-cols-3 gap-1.5">
            {ALIGN_PAGE_BUTTONS.map(btn => (
              <button
                key={btn.mode}
                type="button"
                aria-label={btn.label}
                onClick={() => onChangeElements(els => alignToPage(els, btn.mode, page))}
                className="flex h-8 items-center justify-center rounded-control border border-hairline text-subtext hover:bg-row-alt hover:text-body"
              >
                <Icon name={btn.icon} size={15} />
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-hairline pt-3">
          <TextField label="X (mm)" type="number" value={element.x} onChange={e => update({ x: Number(e.target.value) })} />
          <TextField label="Y (mm)" type="number" value={element.y} onChange={e => update({ y: Number(e.target.value) })} />
          <TextField label="Ancho (mm)" type="number" value={element.w} onChange={e => update({ w: Number(e.target.value) })} />
          <TextField
            label="Alto (mm)"
            type="number"
            value={element.h ?? ''}
            onChange={e => update({ h: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>

        {element.type === 'image' && (
          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <span className="sn-label">Imagen</span>
            <label className="flex flex-col gap-1.5">
              <span className="text-[length:var(--text-sm)] text-subtext">Opacidad ({Math.round((element.opacity ?? 1) * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={element.opacity ?? 1}
                onChange={e => update({ opacity: Number(e.target.value) })}
              />
            </label>
            <Select value={element.fit ?? 'stretch'} onChange={e => update({ fit: e.target.value as 'stretch' | 'contain' })}>
              <option value="stretch">Estirar (deforma si la caja no respeta el ratio)</option>
              <option value="contain">Ajustar (preserva el ratio real del logo)</option>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          <span className="sn-label">Flujo</span>
          <Select value={element.flowAfter ?? ''} onChange={e => update({ flowAfter: e.target.value || undefined })}>
            <option value="">Posición fija (X/Y)</option>
            {elements
              .filter(el => el.id !== element.id)
              .map(el => (
                <option key={el.id} value={el.id}>
                  Después de: {layerLabel(el)}
                </option>
              ))}
          </Select>
          {element.flowAfter && (
            <TextField label="Espacio (mm)" type="number" value={element.flowGap ?? 0} onChange={e => update({ flowGap: Number(e.target.value) })} />
          )}
          <TextField
            label="Visible si (variable, opcional)"
            value={element.visibleIf ?? ''}
            onChange={e => update({ visibleIf: e.target.value || undefined })}
            placeholder="ej. notas"
          />
        </div>
      </div>
    </Popover>
  )
}
