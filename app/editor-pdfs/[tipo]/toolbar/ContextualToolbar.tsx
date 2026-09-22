'use client'

import type { PdfElement, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { resolveToolbarContext, type EditorSelection } from '../selection'
import { EmptyToolbar } from './EmptyToolbar'
import { TextToolbar } from './TextToolbar'
import { LineToolbar } from './LineToolbar'
import { ImageToolbar } from './ImageToolbar'
import { TableToolbar } from './TableToolbar'
import { TotalsBannerToolbar } from './TotalsBannerToolbar'
import { MultiSelectToolbar } from './MultiSelectToolbar'

interface ContextualToolbarProps {
  template: PdfTemplate
  selection: EditorSelection
  onChangeElements: (updater: (elements: PdfElement[]) => PdfElement[]) => void
  onChangeTemplate: (updater: (template: PdfTemplate) => PdfTemplate) => void
  onSelect: (ids: string[]) => void
  snapGrid: number
  onChangeSnapGrid: (grid: number) => void
}

/**
 * Shell delgado (Bloque 11.1, docs/PLAN.md): resuelve `ToolbarContext` y
 * despacha al componente por tipo. Sin lógica por tipo ni acciones de
 * documento acá -- esas viven en `EditorHeader.tsx`, siempre separado
 * (regla confirmada: Aplicar/Preview/Guardar nunca en esta barra).
 */
export function ContextualToolbar({
  template,
  selection,
  onChangeElements,
  onChangeTemplate,
  onSelect,
  snapGrid,
  onChangeSnapGrid,
}: ContextualToolbarProps) {
  const context = resolveToolbarContext(selection, template.elements)

  function deleteIds(ids: string[]) {
    const deletable = template.elements.filter(el => ids.includes(el.id) && !el.required)
    if (deletable.length === 0) return
    const deletableIds = new Set(deletable.map(el => el.id))
    onChangeElements(elements => elements.filter(el => !deletableIds.has(el.id)))
    onSelect([])
  }

  return (
    <div className="flex min-h-[52px] flex-none flex-wrap items-center gap-2 rounded-panel border border-hairline bg-card px-4 py-2.5">
      {context.kind === 'empty' && (
        <EmptyToolbar template={template} onChangeTemplate={onChangeTemplate} snapGrid={snapGrid} onChangeSnapGrid={onChangeSnapGrid} />
      )}
      {context.kind === 'text' && (
        <TextToolbar
          element={context.element}
          elements={template.elements}
          page={template.page}
          tipoDocumento={template.tipoDocumento}
          onChangeElements={onChangeElements}
          onDelete={() => deleteIds([context.element.id])}
        />
      )}
      {context.kind === 'line' && (
        <LineToolbar
          element={context.element}
          elements={template.elements}
          page={template.page}
          onChangeElements={onChangeElements}
          onDelete={() => deleteIds([context.element.id])}
        />
      )}
      {context.kind === 'image' && (
        <ImageToolbar
          element={context.element}
          elements={template.elements}
          page={template.page}
          onChangeElements={onChangeElements}
          onDelete={() => deleteIds([context.element.id])}
        />
      )}
      {context.kind === 'table' && (
        <TableToolbar
          element={context.element}
          elements={template.elements}
          page={template.page}
          onChangeElements={onChangeElements}
          onDelete={() => deleteIds([context.element.id])}
        />
      )}
      {context.kind === 'totals-banner' && (
        <TotalsBannerToolbar
          element={context.element}
          elements={template.elements}
          page={template.page}
          tipoDocumento={template.tipoDocumento}
          onChangeElements={onChangeElements}
          onDelete={() => deleteIds([context.element.id])}
        />
      )}
      {context.kind === 'multiple' && (
        <MultiSelectToolbar
          elements={context.elements}
          onChangeElements={onChangeElements}
          onDelete={() => deleteIds(context.elements.map(el => el.id))}
        />
      )}
    </div>
  )
}
