/**
 * Layout de flujo real del Editor de PDFs (docs/PLAN.md, Bloque 7 en curso):
 * resuelve la posición `y` de los elementos que declaran `flowAfter` +
 * `flowGap` en vez de una `y` absoluta -- necesario porque el contenido de
 * arriba (sobre todo la tabla de partidas) tiene alto variable según los
 * datos reales, y el resto del documento (banner de totales, notas,
 * bloques legales) debe apilarse después de ese alto real, no de un valor
 * fijo adivinado.
 *
 * Módulo autocontenido a propósito (solo depende de `jspdf`/`jspdf-autotable`
 * y de los tipos de `pdf-template-schema.ts`, nunca de `template-renderer.ts`)
 * para que tanto el renderer de servidor (`template-renderer.ts`) como el
 * lienzo del editor (`EditorCanvas.tsx`, cliente) puedan importarlo sin
 * import circular. Usa un documento jsPDF descartable propio solo para medir
 * (splitTextToSize/autoTable) -- nunca dibuja el documento final.
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrencyPdf, JsPDFWithAutoTable } from '@/lib/server/pdf/pdf-base-config'
import { formatDateDisplay } from '@/lib/format-date'
import type { PdfElement, PdfTemplate, TableElement, TextElement } from '@/lib/server/pdf/pdf-template-schema'

export interface ResolvedElement {
  id: string
  /** y resuelta (mm) -- absoluta para elementos sin `flowAfter`, calculada para los que sí lo tienen. */
  y: number
  /** false si `visibleIf` (del elemento) existe y es falsy en `data` -- no se renderiza ni ocupa alto. */
  visible: boolean
  /** borde inferior resuelto (mm) -- lo que un elemento dependiente (`flowAfter`) suma como punto de partida. */
  bottom: number
}

// Aproximación mm/pt calibrada contra los valores reales que ya usa
// cotizacion-pdf.ts para texto envuelto: 4.8mm/línea a 8.5pt (notas) y
// 4.55mm/línea a 8.5pt (generales/costos/cancelación) -- ambos ~0.53-0.56.
const LINE_HEIGHT_MM_PER_PT = 0.55

/**
 * mm por punto tipográfico real (25.4mm/pulgada ÷ 72pt/pulgada) -- distinto
 * de `LINE_HEIGHT_MM_PER_PT` (que aproxima alto de línea, no tamaño de
 * fuente). `EditorCanvas.tsx` la usa para que el tamaño de texto del lienzo
 * no diverja del PDF real (antes: factores `*0.6`/`*0.5` sin justificar en
 * el lienzo -- docs/PLAN.md, Gap #3 / Roadmap P0-C).
 */
export const MM_PER_PT = 25.4 / 72

export function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, source)
}

export function interpolateText(text: string, data: Record<string, unknown>, format?: 'date' | 'currency'): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (literal, path: string) => {
    const value = getByPath(data, path)
    if (value === undefined || value === null) return literal
    if (format === 'date' && typeof value === 'string') return formatDateDisplay(value)
    if (format === 'currency' && typeof value === 'number') return formatCurrencyPdf(value)
    return String(value)
  })
}

export function resolveRowsBinding(data: Record<string, unknown>, rowsBinding: string): Record<string, unknown>[] {
  const value = getByPath(data, rowsBinding)
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

function isVisible(el: PdfElement, data: Record<string, unknown>): boolean {
  if (el.visibleIf === undefined) return true
  return Boolean(getByPath(data, el.visibleIf))
}

/**
 * Alto real (mm) de un `totals-banner` -- misma fórmula que ya usa
 * cotizacion-pdf.ts (rowH 5.5 / rowGap 1.6 / padV 3.1 / mínimo 28), ahora
 * parametrizable desde el schema. Solo cuenta las filas visibles (su propio
 * `visibleIf` de fila, no el del elemento). Única fuente de esta fórmula --
 * `template-renderer.ts` (`renderTotalsBanner`) la importa en vez de
 * recalcularla (antes duplicada a propósito en ambos archivos, docs/PLAN.md
 * Gap #4 / Roadmap P0-C; mantener en sync si cambia).
 */
export function totalsBannerHeight(el: Extract<PdfElement, { type: 'totals-banner' }>, data: Record<string, unknown>): number {
  const visibleRows = el.rows.filter(row => row.visibleIf === undefined || Boolean(getByPath(data, row.visibleIf)))
  const rowH = el.rowHeight ?? 5.5
  const rowGap = el.rowGap ?? 1.6
  const padY = el.padY ?? 3.1
  const minHeight = el.minHeight ?? 28
  const rowsH = visibleRows.length * rowH + Math.max(0, visibleRows.length - 1) * rowGap
  return Math.max(rowsH + padY * 2, minHeight)
}

/**
 * Agrupa `rows` por `el.groupBy` igual que `renderGroupedTable`
 * (template-renderer.ts) para medir el `finalY` real de una tabla sin
 * dibujar el documento final -- mantener sincronizado si cambia el
 * agrupado allá.
 */
function formatCellValue(value: unknown, format: TableElement['cols'][number]['format']): string {
  if (format === 'currency' && typeof value === 'number') return formatCurrencyPdf(value)
  return String(value ?? '')
}

function measureTableBottom(doc: jsPDF, el: TableElement, rows: Record<string, unknown>[], startY: number): number {
  const cols = el.cols.filter(c => c.visible)
  const body: (string | number)[][] = []

  if (el.groupBy) {
    const groups: string[] = []
    rows.forEach(row => {
      const g = String(row[el.groupBy as string] ?? '')
      if (!groups.includes(g)) groups.push(g)
    })
    groups.forEach((g, gi) => {
      const groupRows = rows.filter(r => String(r[el.groupBy as string] ?? '') === g)
      groupRows.forEach((row, ri) => {
        body.push([ri === 0 ? g : '', ...cols.filter(c => c.field !== el.groupBy).map(c => formatCellValue(row[c.field], c.format))])
      })
      if (gi < groups.length - 1) body.push(Array(cols.length).fill(''))
    })
  } else {
    rows.forEach(row => body.push(cols.map(c => formatCellValue(row[c.field], c.format))))
  }

  autoTable(doc, {
    startY,
    margin: { left: el.x },
    head: [cols.map(c => c.label)],
    body,
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    ...(el.bordered ? { theme: 'grid' as const } : el.zebra ? { theme: 'striped' as const } : {}),
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, { cellWidth: c.w, halign: c.align }])),
  })

  return (doc as JsPDFWithAutoTable).lastAutoTable.finalY
}

function measureTextHeight(doc: jsPDF, el: TextElement, text: string): number {
  if (!el.wrap) return el.size * LINE_HEIGHT_MM_PER_PT
  doc.setFont('helvetica', el.bold ? 'bold' : 'normal')
  doc.setFontSize(el.size)
  const lines = doc.splitTextToSize(text, el.w) as string[]
  return Math.max(1, lines.length) * el.size * LINE_HEIGHT_MM_PER_PT
}

/** Alto que un elemento aporta al flujo -- 0 para los que no empujan contenido (línea). `y` es la posición ya resuelta (no `el.y`: un elemento con `flowAfter` puede no coincidir). */
function measureElementHeight(doc: jsPDF, el: PdfElement, data: Record<string, unknown>, y: number): number {
  switch (el.type) {
    case 'text':
      return measureTextHeight(doc, el, interpolateText(el.text, data, el.format))
    case 'line':
      return 0
    case 'image':
      return el.h ?? el.w
    case 'totals-banner':
      return totalsBannerHeight(el, data)
    case 'table': {
      const rows = resolveRowsBinding(data, el.rowsBinding)
      return measureTableBottom(doc, el, rows, y) - y
    }
  }
}

/** Orden topológico por `flowAfter` (Kahn) -- ids sin dependencia primero. Zod ya rechaza ciclos/ids inexistentes al guardar; esto falla explícito igual si algo los saltea (ej. datos legacy). */
function topologicalOrder(elements: PdfElement[]): PdfElement[] {
  const byId = new Map(elements.map(el => [el.id, el]))
  const resolved = new Set<string>()
  const order: PdfElement[] = []
  const pending = [...elements]

  while (pending.length > 0) {
    const before = pending.length
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const el = pending[i]
      const dep = el.flowAfter
      if (dep === undefined || resolved.has(dep) || !byId.has(dep)) {
        order.push(el)
        resolved.add(el.id)
        pending.splice(i, 1)
      }
    }
    if (pending.length === before) {
      throw new Error(
        `pdf-template-layout: flowAfter forma un ciclo o referencia un id inexistente (${pending.map(el => el.id).join(', ')})`
      )
    }
  }

  return order
}

/**
 * Resuelve la posición real de cada elemento del template. Los elementos
 * `sticky` (header/footer repetido) no participan del flujo -- se dibujan
 * aparte (`redrawSticky`), igual que hoy.
 */
export function resolveTemplateLayout(template: PdfTemplate, data: Record<string, unknown>): ResolvedElement[] {
  const doc = new jsPDF('p', 'mm', [template.page.width, template.page.height])
  // Igual que `isStickyRenderable` en template-renderer.ts: tabla y
  // totals-banner no tienen forma de elemento sticky -- si llegan marcados
  // `sticky` por error de schema, siguen en el flujo normal en vez de
  // desaparecer del layout resuelto.
  const flowable = template.elements.filter(el => el.sticky === undefined || el.type === 'table' || el.type === 'totals-banner')
  const ordered = topologicalOrder(flowable)
  const bottomById = new Map<string, number>()
  const results: ResolvedElement[] = []

  for (const el of ordered) {
    const visible = isVisible(el, data)
    const y = el.flowAfter !== undefined ? (bottomById.get(el.flowAfter) ?? 0) + (el.flowGap ?? 0) : el.y
    const bottom = visible ? y + measureElementHeight(doc, el, data, y) : y
    bottomById.set(el.id, bottom)
    results.push({ id: el.id, y, visible, bottom })
  }

  return results
}
