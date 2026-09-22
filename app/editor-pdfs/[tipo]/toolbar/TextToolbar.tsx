'use client'

import { useState } from 'react'
import type { PdfDocumentType, PdfElement, PdfPage, TextElement } from '@/lib/server/pdf/pdf-template-schema'
import { getVariablesForDocumento } from '@/lib/server/pdf/pdf-template-variables'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Popover } from '@/components/ui/Popover'
import { Icon } from '@/components/ui/Icon'
import { ColorSwatchPopover } from './shared/ColorSwatchPopover'
import { PositionPopover } from './shared/PositionPopover'
import { DeleteButton } from './shared/DeleteButton'

interface TextToolbarProps {
  element: TextElement
  elements: PdfElement[]
  page: PdfPage
  tipoDocumento: PdfDocumentType
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onDelete: () => void
}

/**
 * Toolbar de texto (Bloque 11.1, docs/PLAN.md) -- fila principal: tamaño,
 * negrita, mayúsculas, alinear (4 modos incl. justify), swatch de color.
 * "⋯ Más": formato, envolver, insertar variable. Edición del contenido en sí
 * (`el.text`) se retira de acá -- llega en Bloque 11.2 vía doble-click en el
 * lienzo (`TextEditOverlay.tsx`); "Insertar variable" sigue siendo la única
 * vía de cambiar contenido en este bloque, y por eso conserva el flujo de
 * confirmación de texto legal que antes vivía en Inspector.tsx.
 */
export function TextToolbar({ element, elements, page, tipoDocumento, onChangeElements, onDelete }: TextToolbarProps) {
  const [showVariables, setShowVariables] = useState(false)
  const [pendingLegalText, setPendingLegalText] = useState<string | null>(null)

  function update(patch: Partial<TextElement>) {
    onChangeElements(els => els.map(el => (el.id === element.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  function requestTextChange(text: string) {
    if (element.legal) {
      setPendingLegalText(text)
      return
    }
    update({ text })
  }

  function confirmLegalEdit() {
    if (pendingLegalText === null) return
    update({ text: pendingLegalText })
    setPendingLegalText(null)
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <div className="flex flex-none items-center gap-1 rounded-control border border-hairline bg-input px-2">
        <button type="button" className="text-subtext hover:text-body" aria-label="Reducir tamaño" onClick={() => update({ size: Math.max(4, element.size - 0.5) })}>
          <Icon name="chevron-left" size={13} />
        </button>
        <span className="w-8 text-center text-[length:var(--text-sm)] text-body">{element.size}</span>
        <button type="button" className="text-subtext hover:text-body" aria-label="Aumentar tamaño" onClick={() => update({ size: element.size + 0.5 })}>
          <Icon name="chevron-right" size={13} />
        </button>
      </div>

      <ToolbarToggle active={element.bold} onClick={() => update({ bold: !element.bold })} ariaLabel="Negrita">
        <Icon name="bold" size={16} />
      </ToolbarToggle>
      <ToolbarToggle active={element.upper ?? false} onClick={() => update({ upper: !element.upper })} ariaLabel="Mayúsculas">
        <Icon name="case-sensitive" size={16} />
      </ToolbarToggle>

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
            onClick={() => update({ align: mode })}
            className={`flex h-[30px] w-8 items-center justify-center border-r border-hairline last:border-r-0 ${
              element.align === mode ? 'bg-accent-tint text-accent' : 'text-subtext hover:bg-row-alt'
            }`}
          >
            <Icon name={icon} size={15} />
          </button>
        ))}
      </div>

      <ColorSwatchPopover value={element.colorToken} onChange={token => update({ colorToken: token })} />

      <div className="mx-1 h-6 w-px flex-none bg-hairline" />

      <Popover
        trigger={({ onClick, ref, 'aria-expanded': expanded }) => (
          <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-expanded={expanded}
            aria-label="Más opciones de texto"
            className={`flex h-[30px] flex-none items-center justify-center rounded-control px-2 transition-colors ${
              expanded ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row-alt'
            }`}
          >
            <Icon name="more" size={16} />
          </button>
        )}
        panelClassName="w-[240px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised z-20"
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-[length:var(--text-base)] text-body">
            <input type="checkbox" checked={element.wrap ?? false} onChange={e => update({ wrap: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
            Envolver texto (párrafo)
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="sn-label">Formato</span>
            <select
              value={element.format ?? ''}
              onChange={e => update({ format: (e.target.value || undefined) as 'date' | 'currency' | undefined })}
              className="h-[var(--control-height)] rounded-control border border-hairline bg-input px-2 text-[length:var(--text-base)] text-body"
            >
              <option value="">Sin formato</option>
              <option value="date">Fecha</option>
              <option value="currency">Moneda</option>
            </select>
          </label>
          <Button variant="secondary" size="md" onClick={() => setShowVariables(true)}>
            Insertar variable
          </Button>
        </div>
      </Popover>

      <div className="mx-1 h-6 w-px flex-none bg-hairline" />
      <PositionPopover element={element} elements={elements} page={page} onChangeElements={onChangeElements} />
      <DeleteButton elements={[element]} onDelete={onDelete} />

      {showVariables && (
        <Modal title="Variables disponibles" onClose={() => setShowVariables(false)}>
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {getVariablesForDocumento(tipoDocumento).map(v => (
              <button
                key={v.path}
                type="button"
                onClick={() => {
                  requestTextChange(`${element.text}{{${v.path}}}`)
                  setShowVariables(false)
                }}
                className="flex items-center justify-between rounded-control px-2 py-1.5 text-left text-[length:var(--text-sm)] hover:bg-row"
              >
                <span className="text-body">{v.label}</span>
                <span className="text-faint">{`{{${v.path}}}`}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {pendingLegalText !== null && (
        <Modal title="Confirmar edición de texto legal" onClose={() => setPendingLegalText(null)}>
          <p className="text-body">Este elemento está marcado como texto legal. ¿Confirmas que quieres cambiar su contenido?</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" onClick={() => setPendingLegalText(null)}>Cancelar</Button>
            <Button variant="primary" size="md" onClick={confirmLegalEdit}>Confirmar cambio</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ToolbarToggle({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] transition-colors ${
        active ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row-alt'
      }`}
    >
      {children}
    </button>
  )
}
