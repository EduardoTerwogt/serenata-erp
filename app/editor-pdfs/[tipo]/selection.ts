import type {
  ImageElement,
  LineElement,
  PdfElement,
  TableElement,
  TextElement,
  TotalsBannerElement,
} from '@/lib/server/pdf/pdf-template-schema'

/**
 * Estado de selección explícito (Bloque 11.1, docs/PLAN.md) -- reemplaza el
 * `selectedIds: string[]` suelto que usaba `page.tsx` antes de este bloque.
 * `EditorCanvas.tsx`/`LayersPanel.tsx` siguen hablando en `string[]` (hit-test
 * de marquee, shift-click, lista de capas); `page.tsx` es el único que envuelve
 * ese `string[]` en `EditorSelection` vía `selectionFromIds`.
 */
export type EditorSelection =
  | { type: 'none' }
  | { type: 'single'; elementId: string }
  | { type: 'multiple'; elementIds: string[] }

export function selectionFromIds(ids: string[]): EditorSelection {
  if (ids.length === 0) return { type: 'none' }
  if (ids.length === 1) return { type: 'single', elementId: ids[0] }
  return { type: 'multiple', elementIds: ids }
}

export function selectionIds(selection: EditorSelection): string[] {
  if (selection.type === 'none') return []
  if (selection.type === 'single') return [selection.elementId]
  return selection.elementIds
}

/**
 * Unión discriminada por tipo de elemento -- elimina los `if (el.type === ...)`
 * dispersos que tenían `Toolbar.tsx`/`Inspector.tsx` antes de este bloque: cada
 * componente de toolbar recibe su `element` ya angostado por TypeScript.
 */
export type ToolbarContext =
  | { kind: 'empty' }
  | { kind: 'text'; element: TextElement }
  | { kind: 'line'; element: LineElement }
  | { kind: 'image'; element: ImageElement }
  | { kind: 'table'; element: TableElement }
  | { kind: 'totals-banner'; element: TotalsBannerElement }
  | { kind: 'multiple'; elements: PdfElement[] }

/**
 * Resuelve `selection` contra `elements` reales -- descarta en silencio ids
 * obsoletos (ej. tras un delete que corrió en el mismo render). Una selección
 * `single` sobre un id ya no existente colapsa a `empty`, no a un error.
 */
export function resolveToolbarContext(selection: EditorSelection, elements: PdfElement[]): ToolbarContext {
  if (selection.type === 'none') return { kind: 'empty' }

  if (selection.type === 'single') {
    const element = elements.find(el => el.id === selection.elementId)
    if (!element) return { kind: 'empty' }
    return { kind: element.type, element } as ToolbarContext
  }

  const resolved = selection.elementIds
    .map(id => elements.find(el => el.id === id))
    .filter((el): el is PdfElement => el !== undefined)
  if (resolved.length === 0) return { kind: 'empty' }
  if (resolved.length === 1) return { kind: resolved[0].type, element: resolved[0] } as ToolbarContext
  return { kind: 'multiple', elements: resolved }
}
