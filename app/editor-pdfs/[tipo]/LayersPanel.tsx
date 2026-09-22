'use client'

import { useState } from 'react'
import type { PdfElement, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { getVariablesForDocumento } from '@/lib/server/pdf/pdf-template-variables'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { layerLabel } from './geometry'

interface LayersPanelProps {
  template: PdfTemplate
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
}

let nextIdCounter = 0
function newId(prefix: string) {
  nextIdCounter += 1
  return `${prefix}-${Date.now()}-${nextIdCounter}`
}

const LAYER_ICON: Record<PdfElement['type'], IconName> = {
  text: 'type',
  table: 'table-2',
  image: 'image',
  line: 'minus',
  'totals-banner': 'dollar-sign',
}

/**
 * Panel de capas (Bloque 11.1, docs/PLAN.md) -- renombre de `Inspector.tsx`,
 * demoted a herramienta secundaria y colapsable: ya NO tiene bloque de
 * "Propiedades" (todo eso vive ahora en `ContextualToolbar.tsx` y sus
 * popovers). Solo lista de capas + agregar/eliminar elementos.
 */
export function LayersPanel({ template, selectedIds, onSelect, onChangeElements }: LayersPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const selected = template.elements.filter(el => selectedIds.includes(el.id))

  function addElement(type: PdfElement['type']) {
    const base = { id: newId(type), x: 20, y: 20, w: 60, zIndex: (template.elements.length ?? 0) + 1 }
    const variables = getVariablesForDocumento(template.tipoDocumento)
    const firstNumberVar = variables.find(v => v.sampleType === 'number')?.path ?? variables[0]?.path ?? 'total'
    let el: PdfElement
    if (type === 'text') {
      el = { ...base, type: 'text', text: 'Nuevo texto', size: 10, bold: false, align: 'left', colorToken: 'ink' }
    } else if (type === 'line') {
      el = { ...base, type: 'line', h: 1, colorToken: 'ink', weight: 0.5 }
    } else if (type === 'image') {
      el = { ...base, h: 20, type: 'image', src: 'logo-serenata' }
    } else if (type === 'totals-banner') {
      el = {
        ...base,
        w: 120,
        type: 'totals-banner',
        bgColorToken: 'ink',
        rows: [{ label: 'Total', valueVariable: firstNumberVar, labelColorToken: 'surface', valueColorToken: 'surface', bold: true, fontSize: 10.5 }],
      }
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

  return (
    <div className="flex w-[280px] flex-none flex-col gap-3 overflow-y-auto border-l border-hairline bg-card p-4">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-between text-left"
        aria-expanded={!collapsed}
      >
        <span className="sn-label">Capas</span>
        <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} className="text-subtext" />
      </button>

      {!collapsed && (
        <>
          <div className="flex flex-col gap-1">
            {[...template.elements]
              .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
              .map(el => (
                <button
                  key={el.id}
                  type="button"
                  onClick={e => onSelect(e.shiftKey ? [...selectedIds, el.id] : [el.id])}
                  className={`flex items-center gap-2 rounded-control px-2 py-1.5 text-left text-[length:var(--text-sm)] ${
                    selectedIds.includes(el.id) ? 'bg-accent-tint text-accent' : 'text-body hover:bg-row'
                  }`}
                >
                  <Icon name={LAYER_ICON[el.type]} size={14} className="flex-none text-faint" />
                  <span className="min-w-0 flex-1 truncate">{layerLabel(el)}</span>
                  {el.required && <LayerBadge tone="neutral">req.</LayerBadge>}
                  {el.flowAfter && <LayerBadge tone="accent">flujo</LayerBadge>}
                  {el.sticky && <LayerBadge tone="neutral">{el.sticky}</LayerBadge>}
                </button>
              ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
            <Button variant="secondary" size="md" onClick={() => addElement('text')}>+ Texto</Button>
            <Button variant="secondary" size="md" onClick={() => addElement('line')}>+ Línea</Button>
            <Button variant="secondary" size="md" onClick={() => addElement('image')}>+ Imagen</Button>
            <Button variant="secondary" size="md" onClick={() => addElement('table')}>+ Tabla</Button>
            <Button variant="secondary" size="md" onClick={() => addElement('totals-banner')}>+ Banner de totales</Button>
            {selected.length > 0 && (
              <Button variant="ghost" size="md" onClick={deleteSelected} disabled={selected.every(el => el.required)}>
                Eliminar
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function LayerBadge({ tone, children }: { tone: 'neutral' | 'accent'; children: React.ReactNode }) {
  return (
    <span className={`flex-none rounded-pill px-1.5 py-0.5 text-[9px] font-medium ${tone === 'accent' ? 'bg-accent-tint text-accent' : 'bg-row-alt text-faint'}`}>
      {children}
    </span>
  )
}
