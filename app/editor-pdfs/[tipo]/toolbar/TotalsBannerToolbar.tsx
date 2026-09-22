'use client'

import { useState } from 'react'
import type { PdfDocumentType, PdfElement, PdfPage, TotalsBannerElement, TotalsBannerRow } from '@/lib/server/pdf/pdf-template-schema'
import { getVariablesForDocumento } from '@/lib/server/pdf/pdf-template-variables'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { ColorSwatchPopover } from './shared/ColorSwatchPopover'
import { PositionPopover } from './shared/PositionPopover'
import { DeleteButton } from './shared/DeleteButton'

interface TotalsBannerToolbarProps {
  element: TotalsBannerElement
  elements: PdfElement[]
  page: PdfPage
  tipoDocumento: PdfDocumentType
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onDelete: () => void
}

/**
 * Toolbar de banner de totales (Bloque 11.1, docs/PLAN.md) -- swatch de
 * `bgColorToken` en la fila principal, "Editar filas" abre el editor de
 * filas ya construido en `Inspector.tsx` (relocalizado a un `Modal` -- una
 * lista larga de filas no cabe en un popover angosto).
 */
export function TotalsBannerToolbar({ element, elements, page, tipoDocumento, onChangeElements, onDelete }: TotalsBannerToolbarProps) {
  const [editingRows, setEditingRows] = useState(false)

  function update(patch: Partial<TotalsBannerElement>) {
    onChangeElements(els => els.map(el => (el.id === element.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  function updateRow(index: number, patch: Partial<TotalsBannerRow>) {
    update({ rows: element.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) })
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <ColorSwatchPopover value={element.bgColorToken} onChange={token => update({ bgColorToken: token })} label="Fondo" />
      <Button variant="secondary" size="md" onClick={() => setEditingRows(true)}>
        Editar filas ({element.rows.length})
      </Button>

      <div className="mx-1 h-6 w-px flex-none bg-hairline" />
      <PositionPopover element={element} elements={elements} page={page} onChangeElements={onChangeElements} />
      <DeleteButton elements={[element]} onDelete={onDelete} />

      {editingRows && (
        <Modal title="Filas del banner de totales" onClose={() => setEditingRows(false)} size="3xl">
          <div className="flex flex-col gap-2">
            {element.rows.map((row, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-control border border-hairline p-2">
                <div className="flex gap-1.5">
                  <TextField value={row.label} onChange={e => updateRow(i, { label: e.target.value })} placeholder="Etiqueta" />
                  <Button variant="ghost" size="md" onClick={() => update({ rows: element.rows.filter((_, ri) => ri !== i) })} disabled={element.rows.length <= 1}>
                    ×
                  </Button>
                </div>
                <Select value={row.valueVariable} onChange={e => updateRow(i, { valueVariable: e.target.value })}>
                  {getVariablesForDocumento(tipoDocumento).map(v => (
                    <option key={v.path} value={v.path}>{v.label}</option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 text-[length:var(--text-sm)] text-body">
                  <input type="checkbox" checked={row.bold} onChange={e => updateRow(i, { bold: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
                  Negrita
                </label>
                <label className="flex items-center gap-2 text-[length:var(--text-sm)] text-body">
                  <input type="checkbox" checked={row.negate ?? false} onChange={e => updateRow(i, { negate: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
                  Negativo (descuento)
                </label>
                <TextField
                  label="Visible si (opcional)"
                  value={row.visibleIf ?? ''}
                  onChange={e => updateRow(i, { visibleIf: e.target.value || undefined })}
                  placeholder="ej. descuento_monto"
                />
              </div>
            ))}
            <Button
              variant="secondary"
              size="md"
              onClick={() =>
                update({
                  rows: [
                    ...element.rows,
                    {
                      label: 'Nueva fila',
                      valueVariable: getVariablesForDocumento(tipoDocumento)[0]?.path ?? 'total',
                      labelColorToken: 'surface',
                      valueColorToken: 'surface',
                      bold: false,
                      fontSize: 9.5,
                    },
                  ],
                })
              }
            >
              + Fila
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
