'use client'

import { useState } from 'react'
import type { PdfElement, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { COLOR_TOKENS } from '@/lib/server/pdf/pdf-color-tokens'
import { getVariablesForDocumento } from '@/lib/server/pdf/pdf-template-variables'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { align, boundingBoxOf, distributeHorizontal, distributeVertical, type AlignMode } from './geometry'

interface InspectorProps {
  template: PdfTemplate
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onChangeTemplate: (updater: (template: PdfTemplate) => PdfTemplate) => void
  snapGrid: number
  onChangeSnapGrid: (grid: number) => void
}

let nextIdCounter = 0
function newId(prefix: string) {
  nextIdCounter += 1
  return `${prefix}-${Date.now()}-${nextIdCounter}`
}

const ALIGN_BUTTONS: { mode: AlignMode; label: string }[] = [
  { mode: 'left', label: 'Izq.' },
  { mode: 'center-h', label: 'Centro H' },
  { mode: 'right', label: 'Der.' },
  { mode: 'top', label: 'Arriba' },
  { mode: 'center-v', label: 'Centro V' },
  { mode: 'bottom', label: 'Abajo' },
]

export function Inspector({
  template,
  selectedIds,
  onSelect,
  onChangeElements,
  onChangeTemplate,
  snapGrid,
  onChangeSnapGrid,
}: InspectorProps) {
  const [pendingLegalEdit, setPendingLegalEdit] = useState<{ id: string; text: string } | null>(null)
  const [showVariables, setShowVariables] = useState(false)

  const selected = template.elements.filter(el => selectedIds.includes(el.id))
  const single = selected.length === 1 ? selected[0] : null

  function updateSingle(patch: Partial<PdfElement>) {
    if (!single) return
    onChangeElements(elements => elements.map(el => (el.id === single.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  function requestTextChange(el: PdfElement, text: string) {
    if (el.type !== 'text') return
    if (el.legal) {
      setPendingLegalEdit({ id: el.id, text })
      return
    }
    updateSingle({ text })
  }

  function confirmLegalEdit() {
    if (!pendingLegalEdit) return
    onChangeElements(elements =>
      elements.map(el => (el.id === pendingLegalEdit.id ? { ...el, text: pendingLegalEdit.text } : el))
    )
    setPendingLegalEdit(null)
  }

  function addElement(type: PdfElement['type']) {
    const base = { id: newId(type), x: 20, y: 20, w: 60, zIndex: (template.elements.length ?? 0) + 1 }
    let el: PdfElement
    if (type === 'text') {
      el = { ...base, type: 'text', text: 'Nuevo texto', size: 10, bold: false, align: 'left', colorToken: 'ink' }
    } else if (type === 'line') {
      el = { ...base, type: 'line', h: 1, colorToken: 'ink', weight: 0.5 }
    } else if (type === 'image') {
      el = { ...base, h: 20, type: 'image', src: 'logo-serenata' }
    } else {
      el = {
        ...base,
        h: 30,
        type: 'table',
        cols: [{ label: 'Columna', field: 'campo', align: 'left', w: 60, visible: true }],
        rowsBinding: 'items',
        bordered: true,
        lightHead: false,
        zebra: false,
      }
    }
    onChangeElements(elements => [...elements, el])
    onSelect([el.id])
  }

  function deleteSelected() {
    const deletable = selected.filter(el => !el.required)
    if (deletable.length === 0) return
    const deletableIds = new Set(deletable.map(el => el.id))
    onChangeElements(elements => elements.filter(el => !deletableIds.has(el.id)))
    onSelect([])
  }

  function bringToFront() {
    if (!single) return
    const maxZ = Math.max(0, ...template.elements.map(el => el.zIndex ?? 0))
    updateSingle({ zIndex: maxZ + 1 })
  }

  function sendToBack() {
    if (!single) return
    const minZ = Math.min(0, ...template.elements.map(el => el.zIndex ?? 0))
    updateSingle({ zIndex: minZ - 1 })
  }

  const box = boundingBoxOf(selected)

  return (
    <div className="flex w-[320px] flex-none flex-col gap-4 overflow-y-auto border-l border-hairline bg-card p-4">
      <div>
        <span className="sn-label">Capas</span>
        <div className="mt-2 flex flex-col gap-1">
          {[...template.elements]
            .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
            .map(el => (
              <button
                key={el.id}
                type="button"
                onClick={e => onSelect(e.shiftKey ? [...selectedIds, el.id] : [el.id])}
                className={`flex items-center justify-between rounded-control px-2 py-1 text-left text-[length:var(--text-sm)] ${
                  selectedIds.includes(el.id) ? 'bg-row-alt text-ink' : 'text-body hover:bg-row'
                }`}
              >
                <span className="truncate">
                  {el.type} {el.required && '· requerido'} {el.sticky && `· ${el.sticky}`}
                </span>
              </button>
            ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
        <Button variant="secondary" size="md" onClick={() => addElement('text')}>+ Texto</Button>
        <Button variant="secondary" size="md" onClick={() => addElement('line')}>+ Línea</Button>
        <Button variant="secondary" size="md" onClick={() => addElement('image')}>+ Imagen</Button>
        <Button variant="secondary" size="md" onClick={() => addElement('table')}>+ Tabla</Button>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="md"
            onClick={deleteSelected}
            disabled={selected.every(el => el.required)}
          >
            Eliminar
          </Button>
        )}
      </div>

      {selected.length > 1 && box && (
        <div className="border-t border-hairline pt-3">
          <span className="sn-label">Alinear ({selected.length} elementos)</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALIGN_BUTTONS.map(btn => (
              <Button key={btn.mode} variant="secondary" size="md" onClick={() => onChangeElements(els => {
                const updated = align(els.filter(e => selectedIds.includes(e.id)), btn.mode)
                const byId = new Map(updated.map(e => [e.id, e]))
                return els.map(e => byId.get(e.id) ?? e)
              })}>
                {btn.label}
              </Button>
            ))}
          </div>
          {selected.length >= 3 && (
            <div className="mt-2 flex gap-1.5">
              <Button variant="secondary" size="md" onClick={() => onChangeElements(els => {
                const updated = distributeHorizontal(els.filter(e => selectedIds.includes(e.id)))
                const byId = new Map(updated.map(e => [e.id, e]))
                return els.map(e => byId.get(e.id) ?? e)
              })}>
                Distribuir H
              </Button>
              <Button variant="secondary" size="md" onClick={() => onChangeElements(els => {
                const updated = distributeVertical(els.filter(e => selectedIds.includes(e.id)))
                const byId = new Map(updated.map(e => [e.id, e]))
                return els.map(e => byId.get(e.id) ?? e)
              })}>
                Distribuir V
              </Button>
            </div>
          )}
        </div>
      )}

      {single && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <span className="sn-label">Propiedades ({single.type})</span>

          <div className="grid grid-cols-2 gap-2">
            <TextField label="X (mm)" type="number" value={single.x} onChange={e => updateSingle({ x: Number(e.target.value) })} />
            <TextField label="Y (mm)" type="number" value={single.y} onChange={e => updateSingle({ y: Number(e.target.value) })} />
            <TextField label="Ancho (mm)" type="number" value={single.w} onChange={e => updateSingle({ w: Number(e.target.value) })} />
            <TextField
              label="Alto (mm)"
              type="number"
              value={single.h ?? ''}
              onChange={e => updateSingle({ h: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="md" onClick={bringToFront}>Al frente</Button>
            <Button variant="ghost" size="md" onClick={sendToBack}>Al fondo</Button>
          </div>

          {single.type === 'text' && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="sn-label">Texto</span>
                <textarea
                  value={single.text}
                  onChange={e => requestTextChange(single, e.target.value)}
                  className="min-h-[70px] rounded-[var(--radius-sm)] border border-hairline bg-input p-2 text-[length:var(--text-base)] text-body outline-none focus:border-accent-quiet"
                />
              </label>
              {single.legal && (
                <p className="text-[length:var(--text-sm)] text-cancelled-fg">
                  Este texto es legal — editar el contenido pide confirmación.
                </p>
              )}
              <Button variant="secondary" size="md" onClick={() => setShowVariables(true)}>
                Insertar variable
              </Button>
              <TextField label="Tamaño" type="number" value={single.size} onChange={e => updateSingle({ size: Number(e.target.value) })} />
              <label className="flex items-center gap-2 text-[length:var(--text-base)] text-body">
                <input type="checkbox" checked={single.bold} onChange={e => updateSingle({ bold: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
                Negrita
              </label>
              <label className="flex items-center gap-2 text-[length:var(--text-base)] text-body">
                <input type="checkbox" checked={single.upper ?? false} onChange={e => updateSingle({ upper: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
                Mayúsculas
              </label>
              <Select value={single.align} onChange={e => updateSingle({ align: e.target.value as 'left' | 'center' | 'right' })}>
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </Select>
              <ColorSwatchPicker value={single.colorToken} onChange={token => updateSingle({ colorToken: token })} />
            </>
          )}

          {single.type === 'line' && (
            <>
              <TextField label="Grosor (mm)" type="number" step="0.1" value={single.weight} onChange={e => updateSingle({ weight: Number(e.target.value) })} />
              <ColorSwatchPicker value={single.colorToken} onChange={token => updateSingle({ colorToken: token })} />
            </>
          )}

          {single.type === 'image' && (
            <Select value={single.src} onChange={e => updateSingle({ src: e.target.value as 'logo-iso' | 'logo-serenata' })}>
              <option value="logo-iso">Logo ISO</option>
              <option value="logo-serenata">Logo Serenata</option>
            </Select>
          )}

          {single.type === 'table' && (
            <>
              <TextField label="rowsBinding" value={single.rowsBinding} onChange={e => updateSingle({ rowsBinding: e.target.value })} />
              <TextField label="groupBy (opcional)" value={single.groupBy ?? ''} onChange={e => updateSingle({ groupBy: e.target.value || undefined })} />
              <label className="flex items-center gap-2 text-[length:var(--text-base)] text-body">
                <input type="checkbox" checked={single.bordered} onChange={e => updateSingle({ bordered: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
                Con bordes
              </label>
              <label className="flex items-center gap-2 text-[length:var(--text-base)] text-body">
                <input type="checkbox" checked={single.zebra} onChange={e => updateSingle({ zebra: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
                Zebra
              </label>
            </>
          )}
        </div>
      )}

      {selected.length === 0 && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-3">
          <span className="sn-label">Página</span>
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
          <TextField
            label="Grid de snap (mm, 0 = sin snap)"
            type="number"
            value={snapGrid}
            onChange={e => onChangeSnapGrid(Number(e.target.value))}
          />
        </div>
      )}

      {pendingLegalEdit && (
        <Modal title="Confirmar edición de texto legal" onClose={() => setPendingLegalEdit(null)}>
          <p className="text-body">
            Este elemento está marcado como texto legal. ¿Confirmas que quieres cambiar su contenido?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="md" onClick={() => setPendingLegalEdit(null)}>Cancelar</Button>
            <Button variant="primary" size="md" onClick={confirmLegalEdit}>Confirmar cambio</Button>
          </div>
        </Modal>
      )}

      {showVariables && single?.type === 'text' && (
        <Modal title="Variables disponibles" onClose={() => setShowVariables(false)}>
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {getVariablesForDocumento(template.tipoDocumento).map(v => (
              <button
                key={v.path}
                type="button"
                onClick={() => {
                  requestTextChange(single, `${single.text}{{${v.path}}}`)
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
    </div>
  )
}

function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  return (
    <div>
      <span className="sn-label">Color</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.entries(COLOR_TOKENS).map(([token, [r, g, b]]) => (
          <button
            key={token}
            type="button"
            aria-label={token}
            onClick={() => onChange(token)}
            className={`h-6 w-6 rounded-full border-2 ${value === token ? 'border-[rgb(254,123,1)]' : 'border-hairline'}`}
            style={{ backgroundColor: `rgb(${r},${g},${b})` }}
          />
        ))}
      </div>
    </div>
  )
}
