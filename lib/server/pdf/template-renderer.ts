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
import { formatCurrencyPdf } from '@/lib/server/pdf/pdf-base-config'
import { JsPDFWithAutoTable } from '@/lib/server/pdf/pdf-base-config'
import { getIsoLogoBase64, getSerenataLogoBase64 } from '@/lib/server/pdf/cotizacion-pdf-helpers'
import {
  getByPath,
  interpolateText,
  resolveRowsBinding,
  resolveTemplateLayout,
  totalsBannerHeight,
} from '@/lib/server/pdf/pdf-template-layout'
import type {
  ImageElement,
  LineElement,
  PdfElement,
  PdfTemplate,
  TableElement,
  TextElement,
  TotalsBannerElement,
} from '@/lib/server/pdf/pdf-template-schema'

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
  align?: 'left' | 'center' | 'right' | 'justify'
  spacing?: number
  color?: [number, number, number]
  /** Envuelto (Bloque 2, `renderFromTemplate`): líneas ya partidas + ancho máximo -- ausentes = una sola línea (comportamiento original del spike). */
  lines?: string[]
  maxWidth?: number
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
  format?: 'currency'
}

function formatCellValue(value: unknown, format: SpikeTableColumn['format']): string {
  if (format === 'currency' && typeof value === 'number') return formatCurrencyPdf(value)
  return String(value ?? '')
}

export interface SpikeTableElement {
  type: 'table'
  x: number
  y: number
  cols: SpikeTableColumn[]
  rows: Record<string, unknown>[]
  groupBy?: string
  // Estilo opcional (Bloque 2, `renderFromTemplate`): ausentes = comportamiento
  // idéntico al spike original (tema `striped` por defecto de autoTable).
  headColor?: [number, number, number]
  borderColor?: [number, number, number]
  bordered?: boolean
  zebra?: boolean
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
  if (el.lines) {
    doc.text(el.lines, el.x, el.y, { align: el.align ?? 'left', maxWidth: el.maxWidth })
  } else {
    doc.text(el.text, el.x, el.y, { align: el.align ?? 'left' })
  }
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
          ...el.cols.filter(c => c.field !== el.groupBy).map(c => formatCellValue(row[c.field], c.format)),
        ])
      })
      if (gi < groups.length - 1) {
        body.push(Array(el.cols.length).fill(''))
      }
    })
  } else {
    el.rows.forEach(row => {
      body.push(el.cols.map(c => formatCellValue(row[c.field], c.format)))
    })
  }

  autoTable(doc, {
    startY,
    margin: { left: el.x },
    head: [el.cols.map(c => c.label)],
    body,
    styles: {
      fontSize: 8.5,
      cellPadding: 1.5,
      ...(el.borderColor ? { lineColor: el.borderColor, lineWidth: 0.1 } : {}),
    },
    ...(el.bordered ? { theme: 'grid' as const } : el.zebra ? { theme: 'striped' as const } : {}),
    ...(el.headColor ? { headStyles: { fillColor: el.headColor } } : {}),
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

// ==================== renderFromTemplate (Bloque 2, Track A) ====================

type StickyCapableElement = TextElement | LineElement | ImageElement

function isStickyRenderable(el: PdfElement): el is StickyCapableElement & { sticky: 'header' | 'footer' } {
  // TableElement y TotalsBannerElement no tienen shape en
  // StickyElement/redrawSticky — si llegan marcados `sticky` por error de
  // schema, se renderizan en el flujo normal en vez de perderse en silencio.
  return el.type !== 'table' && el.type !== 'totals-banner' && el.sticky !== undefined
}

function buildSpikeText(
  doc: jsPDF,
  el: TextElement,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): SpikeTextElement {
  let text = interpolateText(el.text, data, el.format)
  if (el.upper) text = text.toUpperCase()
  const base: SpikeTextElement = {
    type: 'text',
    x: el.x,
    y: el.y,
    text,
    size: el.size,
    bold: el.bold,
    align: el.align,
    spacing: el.spacing,
    color: resolveColor(el.colorToken),
  }
  if (!el.wrap) return base
  doc.setFont('helvetica', el.bold ? 'bold' : 'normal')
  doc.setFontSize(el.size)
  return { ...base, lines: doc.splitTextToSize(text, el.w) as string[], maxWidth: el.w }
}

/**
 * `bgToken` solo se dibuja cuando el elemento define `h` (alto concreto) —
 * sin él no hay una caja bien definida detrás del texto y no se inventa una.
 */
function drawTextBackground(
  doc: jsPDF,
  el: TextElement,
  resolveColor: (token: string) => [number, number, number]
): void {
  if (!el.bgToken || el.h === undefined) return
  const [r, g, b] = resolveColor(el.bgToken)
  doc.setFillColor(r, g, b)
  doc.rect(el.x, el.y - el.h, el.w, el.h, 'F')
}

function buildSpikeLine(
  el: LineElement,
  resolveColor: (token: string) => [number, number, number]
): SpikeLineElement {
  return {
    type: 'line',
    x: el.x,
    y: el.y,
    w: el.w,
    color: resolveColor(el.colorToken),
    weight: el.weight,
  }
}

function resolveLogoData(src: ImageElement['src']): string | null {
  return src === 'logo-iso' ? getIsoLogoBase64() : getSerenataLogoBase64()
}

function buildSpikeImage(el: ImageElement): SpikeImageElement | null {
  const data = resolveLogoData(el.src)
  if (!data) return null
  // `h` es opcional en el schema; sin alto explícito se usa `w` (fallback
  // cuadrado) — el editor visual (Bloque 5) siempre fija ambos.
  return { type: 'image', x: el.x, y: el.y, w: el.w, h: el.h ?? el.w, data }
}

function renderTableElement(
  doc: jsPDF,
  el: TableElement,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): void {
  const rows = resolveRowsBinding(data, el.rowsBinding)
  const cols = el.cols
    .filter(c => c.visible)
    .map(c => ({ label: c.label, field: c.field, align: c.align, w: c.w, format: c.format }))

  renderGroupedTable(
    doc,
    {
      type: 'table',
      x: el.x,
      y: el.y,
      cols,
      rows,
      groupBy: el.groupBy,
      bordered: el.bordered,
      zebra: el.zebra,
      headColor: el.headerColorToken ? resolveColor(el.headerColorToken) : undefined,
      borderColor: el.borderColorToken ? resolveColor(el.borderColorToken) : undefined,
    },
    el.y
  )
}

function buildStickyElement(
  doc: jsPDF,
  el: StickyCapableElement & { sticky: 'header' | 'footer' },
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): StickyElement | null {
  if (el.type === 'text') return { ...buildSpikeText(doc, el, data, resolveColor), sticky: el.sticky }
  if (el.type === 'line') return { ...buildSpikeLine(el, resolveColor), sticky: el.sticky }
  const image = buildSpikeImage(el)
  return image ? { ...image, sticky: el.sticky } : null
}

/**
 * `totals-banner`: banda de fondo con filas label/valor apiladas y alto
 * dinámico (docs/PLAN.md, sección "Bloques" #7) — mismo layout que
 * `buildTotalsRows()`/el dibujo manual en `cotizacion-pdf.ts`, generalizado
 * a schema. Solo cuenta/dibuja las filas cuyo `visibleIf` de fila (si
 * existe) sea verdadero. `bannerH` se calcula con `totalsBannerHeight()`
 * (`pdf-template-layout.ts`), única fuente de la fórmula -- antes duplicada
 * a propósito acá, consolidada en Roadmap P0-C.
 */
function renderTotalsBanner(
  doc: jsPDF,
  el: TotalsBannerElement,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): void {
  const visibleRows = el.rows.filter(row => row.visibleIf === undefined || Boolean(getByPath(data, row.visibleIf)))
  const rowH = el.rowHeight ?? 5.5
  const rowGap = el.rowGap ?? 1.6
  const padY = el.padY ?? 3.1
  const bannerH = totalsBannerHeight(el, data)

  const [bgR, bgG, bgB] = resolveColor(el.bgColorToken)
  doc.setFillColor(bgR, bgG, bgB)
  doc.rect(el.x, el.y, el.w, bannerH, 'F')

  const valueRightX = el.x + el.w - 7
  const labelRightX = valueRightX - 30 - 1.4
  let ty = el.y + padY + rowH * 0.75

  visibleRows.forEach((row, i) => {
    if (i > 0) ty += rowH + rowGap
    const rawValue = getByPath(data, row.valueVariable)
    const value = typeof rawValue === 'number' ? formatCurrencyPdf(rawValue) : String(rawValue ?? '')
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.setFontSize(row.fontSize)
    doc.setTextColor(...resolveColor(row.labelColorToken))
    doc.text(row.label, labelRightX, ty, { align: 'right' })
    doc.setTextColor(...resolveColor(row.valueColorToken))
    doc.text(row.negate && typeof rawValue === 'number' && rawValue > 0 ? `-${value}` : value, valueRightX, ty, {
      align: 'right',
    })
  })
}

/**
 * Renderer final del schema tipado (Bloque 2, docs/PLAN.md): recorre
 * `template.elements`, separa los `sticky` del resto, renderiza el flujo
 * normal ordenado por `zIndex` con los primitivos de arriba, interpola
 * `{{variable}}` contra `data`, resuelve `colorToken`/`bgToken`/
 * `headerColorToken`/`borderColorToken` con `resolveColor` (inyectado — no
 * importa `pdf-color-tokens.ts`, eso se cablea en la integración) y termina
 * redibujando los `sticky` con `redrawSticky`.
 */
export function renderFromTemplate(
  doc: jsPDF,
  template: PdfTemplate,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): void {
  const stickyEls = template.elements.filter(isStickyRenderable)
  const flowEls = template.elements.filter(el => !isStickyRenderable(el))
  const sortedFlow = [...flowEls].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))

  // Resuelve `y` real para los elementos con `flowAfter` (pdf-template-layout.ts)
  // -- el alto real de lo que está arriba (sobre todo la tabla de partidas)
  // solo se conoce con los datos reales, nunca con un valor fijo adivinado.
  const layout = resolveTemplateLayout(template, data)
  const layoutById = new Map(layout.map(r => [r.id, r]))

  for (const el of sortedFlow) {
    const resolvedPosition = layoutById.get(el.id)
    if (!resolvedPosition || !resolvedPosition.visible) continue
    const positioned = { ...el, y: resolvedPosition.y } as PdfElement

    switch (positioned.type) {
      case 'text':
        drawTextBackground(doc, positioned, resolveColor)
        renderText(doc, buildSpikeText(doc, positioned, data, resolveColor))
        break
      case 'line':
        renderLine(doc, buildSpikeLine(positioned, resolveColor))
        break
      case 'image': {
        const image = buildSpikeImage(positioned)
        if (image) renderImage(doc, image)
        break
      }
      case 'table':
        renderTableElement(doc, positioned, data, resolveColor)
        break
      case 'totals-banner':
        renderTotalsBanner(doc, positioned, data, resolveColor)
        break
    }
  }

  const sticky = stickyEls
    .map(el => buildStickyElement(doc, el, data, resolveColor))
    .filter((el): el is StickyElement => el !== null)

  redrawSticky(doc, template.page, sticky)
}
