'use client'

import type { PdfElement, PdfPage, PdfTableColumn, TableElement } from '@/lib/server/pdf/pdf-template-schema'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Select } from '@/components/ui/Select'
import { Popover } from '@/components/ui/Popover'
import { Icon } from '@/components/ui/Icon'
import { PositionPopover } from './shared/PositionPopover'
import { DeleteButton } from './shared/DeleteButton'

interface TableToolbarProps {
  element: TableElement
  elements: PdfElement[]
  page: PdfPage
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onDelete: () => void
}

function newColumn(): PdfTableColumn {
  return { label: 'Columna', field: 'campo', align: 'left', w: 30, visible: true }
}

/**
 * Toolbar de tabla (Bloque 11.1, docs/PLAN.md) -- `bordered`/`zebra` en la
 * fila principal. Nuevo en este bloque: editor de columnas real (agregar/
 * quitar/reordenar/editar label/field/align/w/visible/format) -- el schema
 * de `TableElement.cols[]` ya soportaba todo esto, el hueco era solo de UI
 * (nunca existió CRUD, `Inspector.tsx` no lo tenía tampoco).
 */
export function TableToolbar({ element, elements, page, onChangeElements, onDelete }: TableToolbarProps) {
  function update(patch: Partial<TableElement>) {
    onChangeElements(els => els.map(el => (el.id === element.id ? ({ ...el, ...patch } as PdfElement) : el)))
  }

  function updateColumn(index: number, patch: Partial<PdfTableColumn>) {
    update({ cols: element.cols.map((col, i) => (i === index ? { ...col, ...patch } : col)) })
  }

  function removeColumn(index: number) {
    if (element.cols.length <= 1) return
    update({ cols: element.cols.filter((_, i) => i !== index) })
  }

  function moveColumn(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= element.cols.length) return
    const cols = [...element.cols]
    ;[cols[index], cols[target]] = [cols[target], cols[index]]
    update({ cols })
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <label className="flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] text-body">
        <input type="checkbox" checked={element.bordered} onChange={e => update({ bordered: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
        Bordes
      </label>
      <label className="flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[length:var(--text-sm)] text-body">
        <input type="checkbox" checked={element.zebra} onChange={e => update({ zebra: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
        Zebra
      </label>

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
            <Icon name="table-2" size={16} /> Columnas ({element.cols.length})
          </button>
        )}
        panelClassName="w-[420px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised z-20"
      >
        <div className="flex flex-col gap-2">
          {element.cols.map((col, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-control border border-hairline p-2">
              <div className="flex items-center gap-1.5">
                <TextField value={col.label} onChange={e => updateColumn(i, { label: e.target.value })} placeholder="Etiqueta" className="flex-1" />
                <TextField value={col.field} onChange={e => updateColumn(i, { field: e.target.value })} placeholder="campo" className="flex-1" />
                <button type="button" aria-label="Subir columna" disabled={i === 0} onClick={() => moveColumn(i, -1)} className="text-subtext hover:text-body disabled:opacity-30">
                  <Icon name="chevron-up" size={15} />
                </button>
                <button type="button" aria-label="Bajar columna" disabled={i === element.cols.length - 1} onClick={() => moveColumn(i, 1)} className="text-subtext hover:text-body disabled:opacity-30">
                  <Icon name="chevron-down" size={15} />
                </button>
                <button type="button" aria-label="Quitar columna" disabled={element.cols.length <= 1} onClick={() => removeColumn(i)} className="text-subtext hover:text-cancelled-fg disabled:opacity-30">
                  <Icon name="close" size={15} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <Select value={col.align} onChange={e => updateColumn(i, { align: e.target.value as PdfTableColumn['align'] })} className="flex-1">
                  <option value="left">Izquierda</option>
                  <option value="center">Centro</option>
                  <option value="right">Derecha</option>
                </Select>
                <TextField
                  type="number"
                  value={col.w}
                  onChange={e => updateColumn(i, { w: Number(e.target.value) })}
                  className="w-20"
                  aria-label="Ancho (mm)"
                />
                <Select
                  value={col.format ?? ''}
                  onChange={e => updateColumn(i, { format: (e.target.value || undefined) as 'currency' | undefined })}
                  className="flex-1"
                >
                  <option value="">Sin formato</option>
                  <option value="currency">Moneda</option>
                </Select>
                <label className="flex flex-none items-center gap-1 text-[length:var(--text-sm)] text-body">
                  <input type="checkbox" checked={col.visible} onChange={e => updateColumn(i, { visible: e.target.checked })} className="h-4 w-4 rounded border-hairline bg-input accent-[var(--color-accent)]" />
                  Visible
                </label>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="md" onClick={() => update({ cols: [...element.cols, newColumn()] })}>
            + Columna
          </Button>
        </div>
      </Popover>

      <Popover
        trigger={({ onClick, ref, 'aria-expanded': expanded }) => (
          <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-expanded={expanded}
            aria-label="Más opciones de tabla"
            className={`flex h-[30px] flex-none items-center justify-center rounded-control px-2 transition-colors ${
              expanded ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row-alt'
            }`}
          >
            <Icon name="more" size={16} />
          </button>
        )}
        panelClassName="w-[260px] rounded-panel border border-hairline bg-card p-3.5 shadow-raised z-20"
      >
        <div className="flex flex-col gap-3">
          <TextField label="rowsBinding" value={element.rowsBinding} onChange={e => update({ rowsBinding: e.target.value })} />
          <TextField label="groupBy (opcional)" value={element.groupBy ?? ''} onChange={e => update({ groupBy: e.target.value || undefined })} />
        </div>
      </Popover>

      <div className="mx-1 h-6 w-px flex-none bg-hairline" />
      <PositionPopover element={element} elements={elements} page={page} onChangeElements={onChangeElements} />
      <DeleteButton elements={[element]} onDelete={onDelete} />
    </div>
  )
}
