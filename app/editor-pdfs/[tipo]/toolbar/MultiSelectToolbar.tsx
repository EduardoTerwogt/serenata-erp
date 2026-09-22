'use client'

import type { PdfElement } from '@/lib/server/pdf/pdf-template-schema'
import { Button } from '@/components/ui/Button'
import { align, bringToFront, distributeHorizontal, distributeVertical, sendToBack, type AlignMode } from '../geometry'
import { LayerOrderButtons } from './shared/LayerOrderButtons'
import { DeleteButton } from './shared/DeleteButton'

interface MultiSelectToolbarProps {
  elements: PdfElement[] // solo los seleccionados
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onDelete: () => void
}

const ALIGN_BUTTONS: { mode: AlignMode; label: string }[] = [
  { mode: 'left', label: 'Izq.' },
  { mode: 'center-h', label: 'Centro H' },
  { mode: 'right', label: 'Der.' },
  { mode: 'top', label: 'Arriba' },
  { mode: 'center-v', label: 'Centro V' },
  { mode: 'bottom', label: 'Abajo' },
]

function applyToSelection(all: PdfElement[], selectedIds: string[], updated: PdfElement[]): PdfElement[] {
  const byId = new Map(updated.map(e => [e.id, e]))
  return all.map(e => (selectedIds.includes(e.id) ? (byId.get(e.id) ?? e) : e))
}

/** Toolbar de multi-selección (Bloque 11.1, docs/PLAN.md): alinear/distribuir/orden extendidos a toda la selección. */
export function MultiSelectToolbar({ elements: selected, onChangeElements, onDelete }: MultiSelectToolbarProps) {
  const selectedIds = selected.map(el => el.id)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
      <span className="flex-none text-[length:var(--text-sm)] text-subtext">{selected.length} elementos</span>
      <div className="mx-1 h-6 w-px flex-none bg-hairline" />

      <div className="flex flex-none gap-1">
        {ALIGN_BUTTONS.map(btn => (
          <Button
            key={btn.mode}
            variant="secondary"
            size="md"
            onClick={() =>
              onChangeElements(els => applyToSelection(els, selectedIds, align(els.filter(e => selectedIds.includes(e.id)), btn.mode)))
            }
          >
            {btn.label}
          </Button>
        ))}
      </div>

      {selected.length >= 3 && (
        <div className="flex flex-none gap-1.5">
          <Button
            variant="secondary"
            size="md"
            onClick={() => onChangeElements(els => applyToSelection(els, selectedIds, distributeHorizontal(els.filter(e => selectedIds.includes(e.id)))))}
          >
            Distribuir H
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => onChangeElements(els => applyToSelection(els, selectedIds, distributeVertical(els.filter(e => selectedIds.includes(e.id)))))}
          >
            Distribuir V
          </Button>
        </div>
      )}

      <div className="mx-1 h-6 w-px flex-none bg-hairline" />
      <LayerOrderButtons
        onBringToFront={() => onChangeElements(els => selectedIds.reduce((acc, id) => bringToFront(acc, id), els))}
        onSendToBack={() => onChangeElements(els => [...selectedIds].reverse().reduce((acc, id) => sendToBack(acc, id), els))}
      />

      <Button variant="ghost" size="md" disabled title="Próximamente">
        Agrupar
      </Button>

      <DeleteButton elements={selected} onDelete={onDelete} />
    </div>
  )
}
