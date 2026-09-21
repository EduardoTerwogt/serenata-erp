/**
 * Spike (Bloque 1, docs/PLAN.md "Editor de PDFs"): primitivos de render sobre
 * jsPDF para un schema de elementos posicionados libremente (texto, imagen,
 * línea, tabla agrupable) con header/footer `sticky` repetidos en cada
 * página. Unidades en mm, igual que `cotizacion-pdf.ts` (el generador que ya
 * usa mm de los 4 existentes).
 *
 * No es el `renderFromTemplate()` final: eso llega en el Bloque 2 con el
 * schema tipado (`PdfTemplate`/`PdfElement`), validación Zod y el mapa de
 * tokens `--sn-*`. Aquí solo se valida que las primitivas de jsPDF/
 * jspdf-autotable hacen lo que el plan asume.
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { JsPDFWithAutoTable } from '@/lib/server/pdf/pdf-base-config'

export interface SpikePageConfig {
  width: number
  height: number
  margins: { top: number; right: number; bottom: number; left: number }
}

export interface SpikeTextElement {
  type: 'text'
  x: number
  y: number
  text: string
  size: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
  spacing?: number
  color?: [number, number, number]
}

export interface SpikeLineElement {
  type: 'line'
  x: number
  y: number
  w: number
  color?: [number, number, number]
  weight?: number
}

export interface SpikeImageElement {
  type: 'image'
  x: number
  y: number
  w: number
  h: number
  data: string
}

export interface SpikeTableColumn {
  label: string
  field: string
  align?: 'left' | 'center' | 'right'
  w: number
}

export interface SpikeTableElement {
  type: 'table'
  x: number
  y: number
  cols: SpikeTableColumn[]
  rows: Record<string, unknown>[]
  groupBy?: string
}

export type SpikeElement =
  | SpikeTextElement
  | SpikeLineElement
  | SpikeImageElement
  | (SpikeTableElement & { sticky?: undefined })

export type StickyElement = (SpikeTextElement | SpikeLineElement | SpikeImageElement) & {
  sticky: 'header' | 'footer'
}

export function createSpikeDoc(page: SpikePageConfig): jsPDF {
  return new jsPDF('p', 'mm', [page.width, page.height])
}

export function renderText(doc: jsPDF, el: SpikeTextElement): void {
  doc.setFont('helvetica', el.bold ? 'bold' : 'normal')
  doc.setFontSize(el.size)
  doc.setTextColor(...(el.color ?? [0, 0, 0]))
  // `spacing` = tracking entre caracteres. jsPDF lo soporta nativo vía
  // setCharSpace(mm) — no hace falta simularlo insertando espacios.
  doc.setCharSpace(el.spacing ?? 0)
  doc.text(el.text, el.x, el.y, { align: el.align ?? 'left' })
  doc.setCharSpace(0)
}

export function renderLine(doc: jsPDF, el: SpikeLineElement): void {
  doc.setDrawColor(...(el.color ?? [0, 0, 0]))
  doc.setLineWidth(el.weight ?? 0.2)
  doc.line(el.x, el.y, el.x + el.w, el.y)
}

export function renderImage(doc: jsPDF, el: SpikeImageElement): void {
  doc.addImage(el.data, el.x, el.y, el.w, el.h)
}

/**
 * Agrupa `rows` por `groupBy` reproduciendo el patrón real de
 * `buildItemsBody` (cotizacion-pdf-helpers.ts): etiqueta de grupo en la
 * primera fila del grupo, fila espaciadora entre grupos. No usa ninguna
 * opción nativa de agrupado de autoTable (no existe) — es transformación de
 * datos previa al `body`.
 */
export function renderGroupedTable(doc: jsPDF, el: SpikeTableElement, startY: number): number {
  const body: (string | number)[][] = []

  if (el.groupBy) {
    const groups: string[] = []
    el.rows.forEach(row => {
      const g = String(row[el.groupBy as string] ?? '')
      if (!groups.includes(g)) groups.push(g)
    })
    groups.forEach((g, gi) => {
      const groupRows = el.rows.filter(r => String(r[el.groupBy as string] ?? '') === g)
      groupRows.forEach((row, ri) => {
        body.push([
          ri === 0 ? g : '',
          ...el.cols.filter(c => c.field !== el.groupBy).map(c => String(row[c.field] ?? '')),
        ])
      })
      if (gi < groups.length - 1) {
        body.push(Array(el.cols.length).fill(''))
      }
    })
  } else {
    el.rows.forEach(row => {
      body.push(el.cols.map(c => String(row[c.field] ?? '')))
    })
  }

  autoTable(doc, {
    startY,
    margin: { left: el.x },
    head: [el.cols.map(c => c.label)],
    body,
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    columnStyles: Object.fromEntries(el.cols.map((c, i) => [i, { cellWidth: c.w, halign: c.align ?? 'left' }])),
  })

  return (doc as JsPDFWithAutoTable).lastAutoTable.finalY
}

/**
 * Redibuja los elementos `sticky` en cada página ya generada. Corre
 * **después** de renderizar el resto (tablas incluidas) porque no se sabe de
 * antemano cuántas páginas produce una tabla con datos reales — es el
 * mecanismo alternativo al hook `didDrawPage` de jspdf-autotable que
 * describe `docs/PLAN.md`, y cubre páginas generadas por cualquier
 * elemento, no solo por una tabla.
 */
export function redrawSticky(doc: jsPDF, page: SpikePageConfig, stickyElements: StickyElement[]): void {
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    for (const el of stickyElements) {
      if (el.type === 'text') renderText(doc, el)
      else if (el.type === 'line') renderLine(doc, el)
      else if (el.type === 'image') renderImage(doc, el)
    }
  }
}

/** Alto disponible para contenido no-sticky, según el plan: página menos
 * márgenes menos el alto reservado a header/footer sticky. */
export function contentHeight(page: SpikePageConfig, headerH: number, footerH: number): number {
  return page.height - page.margins.top - page.margins.bottom - headerH - footerH
}
