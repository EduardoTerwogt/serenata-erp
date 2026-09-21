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
import { formatCurrencyPdf, JsPDFWithAutoTable } from '@/lib/server/pdf/pdf-base-config'
import { getIsoLogoBase64, getSerenataLogoBase64 } from '@/lib/server/pdf/cotizacion-pdf-helpers'
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
  align?: 'left' | 'center' | 'right'
  spacing?: number
  color?: [number, number, number]
  // Bloque 7: los bloques legales (GENERALES/COSTOS/CANCELACIÓN) son
  // párrafos largos -- sin esto, jsPDF no hace wrap y el texto se sale del
  // ancho del elemento. Opcional: los textos cortos existentes (spike,
  // Bloque 1-6) no lo necesitan y siguen igual.
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

export interface SpikeTableElement {
  type: 'table'
  x: number
  y: number
  cols: SpikeTableColumn[]
  rows: Record<string, unknown>[]
  groupBy?: string
  // Bloque 7: campo de fila a sumar por grupo -- ver PdfTableColumnSchema
  // ('__groupTotal') y pdf-template-schema.ts para la validación.
  groupTotalOf?: string
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
  doc.text(el.text, el.x, el.y, {
    align: el.align ?? 'left',
    ...(el.maxWidth !== undefined ? { maxWidth: el.maxWidth } : {}),
  })
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
/**
 * Celda de una columna de datos. `'__groupTotal'` (Bloque 7) es el field
 * reservado para "Total categoría": no lee la fila, muestra `groupTotal` solo
 * en la primera fila del grupo (igual que `buildItemsBody`). `format:
 * 'currency'` aplica `formatCurrencyPdf` al valor numérico crudo.
 */
function formatCell(
  col: SpikeTableColumn,
  row: Record<string, unknown>,
  isFirstInGroup: boolean,
  groupTotal: number
): string {
  if (col.field === '__groupTotal') {
    return isFirstInGroup ? formatCurrencyPdf(groupTotal) : ''
  }
  const raw = row[col.field]
  if (col.format === 'currency') {
    return formatCurrencyPdf(Number(raw) || 0)
  }
  return String(raw ?? '')
}

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
      const groupTotal = el.groupTotalOf
        ? groupRows.reduce((sum, r) => sum + (Number(r[el.groupTotalOf as string]) || 0), 0)
        : 0
      groupRows.forEach((row, ri) => {
        body.push([
          ri === 0 ? g : '',
          ...el.cols.filter(c => c.field !== el.groupBy).map(c => formatCell(c, row, ri === 0, groupTotal)),
        ])
      })
      if (gi < groups.length - 1) {
        body.push(Array(el.cols.length).fill(''))
      }
    })
  } else {
    el.rows.forEach(row => {
      body.push(el.cols.map(c => formatCell(c, row, false, 0)))
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

const VARIABLE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g

/** Resuelve un path con notación de puntos (`cliente.nombre`) contra `data`. */
function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined
    return (acc as Record<string, unknown>)[key]
  }, source)
}

/**
 * Interpola `{{variable.path}}` contra `data`. Si la variable no existe se
 * deja el placeholder literal — validar su existencia es responsabilidad del
 * catálogo de variables (Track C), no de esta función.
 */
function interpolateText(text: string, data: Record<string, unknown>): string {
  return text.replace(VARIABLE_PATTERN, (literal, path: string) => {
    const value = getByPath(data, path)
    return value === undefined || value === null ? literal : String(value)
  })
}

function resolveRowsBinding(data: Record<string, unknown>, rowsBinding: string): Record<string, unknown>[] {
  const value = getByPath(data, rowsBinding)
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

type StickyCapableElement = TextElement | LineElement | ImageElement

function isStickyRenderable(el: PdfElement): el is StickyCapableElement & { sticky: 'header' | 'footer' } {
  // TableElement no tiene shape en StickyElement/redrawSticky — si llega
  // marcada `sticky` por error de schema, se renderiza en el flujo normal en
  // vez de perderse silenciosamente.
  return el.type !== 'table' && el.sticky !== undefined
}

function buildSpikeText(
  el: TextElement,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): SpikeTextElement {
  let text = interpolateText(el.text, data)
  if (el.upper) text = text.toUpperCase()
  return {
    type: 'text',
    x: el.x,
    y: el.y,
    text,
    size: el.size,
    bold: el.bold,
    align: el.align,
    spacing: el.spacing,
    color: resolveColor(el.colorToken),
    maxWidth: el.w,
  }
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

/** Devuelve el `finalY` real de la tabla (Bloque 7: lo consume `flowAfter`
 * de elementos que deben ir justo debajo, igual que `lastAutoTable.finalY`
 * en los 4 generadores reales). */
function renderTableElement(
  doc: jsPDF,
  el: TableElement,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): number {
  const rows = resolveRowsBinding(data, el.rowsBinding)
  const cols = el.cols
    .filter(c => c.visible)
    .map(c => ({ label: c.label, field: c.field, align: c.align, w: c.w, format: c.format }))

  return renderGroupedTable(
    doc,
    {
      type: 'table',
      x: el.x,
      y: el.y,
      cols,
      rows,
      groupBy: el.groupBy,
      groupTotalOf: el.groupTotalOf,
      bordered: el.bordered,
      zebra: el.zebra,
      headColor: el.headerColorToken ? resolveColor(el.headerColorToken) : undefined,
      borderColor: el.borderColorToken ? resolveColor(el.borderColorToken) : undefined,
    },
    el.y
  )
}

/**
 * Alto del banner de totales, igual a `bannerH` en `cotizacion-pdf.ts`:
 * crece con la cantidad de filas VISIBLES (Descuento/IVA condicionales)
 * hasta un mínimo de 28mm -- una `h` fija no alcanza cuando se muestran
 * más filas de las que el editor previó.
 */
function computeBannerHeight(visibleRowCount: number): number {
  if (visibleRowCount === 0) return 0
  const rowH = 5.5
  const rowGap = 1.6
  const padV = 3.1
  const totalRowsH = visibleRowCount * rowH + (visibleRowCount - 1) * rowGap
  return Math.max(totalRowsH + padV * 2, 28)
}

/**
 * Banner de totales (Bloque 7, piloto Cotización): fondo relleno +
 * filas label/valor con color propio por fila, filtradas por `visibleIf`
 * (docs/PLAN.md — reproduce `buildTotalsRows` de
 * cotizacion-pdf-helpers.ts, donde Descuento/IVA aparecen solo con datos
 * reales). Layout de filas fijo (no editable) para calzar exacto con el
 * diseño real: mismas constantes que el generador actual. `height` y
 * `visibleRows` se calculan antes de llamar (Bloque 7: `renderFromTemplate`
 * los necesita también para decidir la `y` efectiva vía `flowAfter`).
 */
function renderTotalsBanner(
  doc: jsPDF,
  el: TotalsBannerElement,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number],
  height: number,
  visibleRows: TotalsBannerElement['rows']
): void {
  if (visibleRows.length === 0) return

  const [bgR, bgG, bgB] = resolveColor(el.bgColorToken)
  doc.setFillColor(bgR, bgG, bgB)
  doc.rect(el.x, el.y, el.w, height, 'F')

  const padV = 3.1
  const rowH = 5.5
  const rowGap = 1.6
  const padRight = 7
  const valueMinW = 30
  const gapLV = 1.4
  const valueX = el.x + el.w - padRight
  const labelX = valueX - valueMinW - gapLV
  let ty = el.y + padV + rowH * 0.75

  visibleRows.forEach((row, i) => {
    if (i > 0) ty += rowH + rowGap
    const rawValue = getByPath(data, row.valueVariable)
    const amount = typeof rawValue === 'number' ? rawValue : Number(rawValue) || 0
    const formatted = row.negate ? `-${formatCurrencyPdf(amount)}` : formatCurrencyPdf(amount)

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.setFontSize(row.fontSize)
    doc.setTextColor(...resolveColor(row.labelColorToken))
    doc.text(row.label, labelX, ty, { align: 'right' })
    doc.setTextColor(...resolveColor(row.valueColorToken))
    doc.text(formatted, valueX, ty, { align: 'right' })
  })
}

/**
 * Alto real (mm) de un bloque de texto con wrap, usando las métricas nativas
 * de jsPDF (`splitTextToSize` + `getTextDimensions`) en vez de una constante
 * inventada -- necesario para encadenar `flowAfter` sin adivinar cuánto
 * ocupó el texto anterior.
 */
function measureTextBlockHeight(doc: jsPDF, text: string, size: number, bold: boolean, w: number): number {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  const lines = doc.splitTextToSize(text, w)
  return doc.getTextDimensions(lines, { fontSize: size }).h
}

function buildStickyElement(
  el: StickyCapableElement & { sticky: 'header' | 'footer' },
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): StickyElement | null {
  if (el.type === 'text') return { ...buildSpikeText(el, data, resolveColor), sticky: el.sticky }
  if (el.type === 'line') return { ...buildSpikeLine(el, resolveColor), sticky: el.sticky }
  const image = buildSpikeImage(el)
  return image ? { ...image, sticky: el.sticky } : null
}

/**
 * Orden de render de los elementos de flujo: por `zIndex` como base (igual
 * que antes de Bloque 7), pero adelantando cualquier elemento con
 * `flowAfter` hasta después del elemento que referencia -- necesario para
 * conocer su borde inferior REAL antes de resolver la `y` del que sigue.
 * Zod ya garantiza ids únicos y ausencia de ciclos; el `visited` de abajo
 * es solo para no recorrer dos veces el mismo elemento.
 */
function sortFlowElements(elements: PdfElement[]): PdfElement[] {
  const zSorted = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  const byId = new Map(zSorted.map(el => [el.id, el]))
  const visited = new Set<string>()
  const result: PdfElement[] = []

  function visit(el: PdfElement) {
    if (visited.has(el.id)) return
    visited.add(el.id)
    const dep = el.flowAfter ? byId.get(el.flowAfter) : undefined
    if (dep) visit(dep)
    result.push(el)
  }

  zSorted.forEach(visit)
  return result
}

/**
 * Renderer final del schema tipado (Bloque 2, docs/PLAN.md): recorre
 * `template.elements`, separa los `sticky` del resto, renderiza el flujo
 * normal ordenado por `zIndex`/`flowAfter` con los primitivos de arriba,
 * interpola `{{variable}}` contra `data`, resuelve `colorToken`/`bgToken`/
 * `headerColorToken`/`borderColorToken` con `resolveColor` (inyectado — no
 * importa `pdf-color-tokens.ts`, eso se cablea en la integración) y termina
 * redibujando los `sticky` con `redrawSticky`.
 *
 * `flowAfter` (Bloque 7, piloto Cotización): un elemento sin `flowAfter` usa
 * su `y` fija, igual que Bloques 1-6. Con `flowAfter`, la `y` efectiva es el
 * borde inferior REAL (post-render) del elemento referenciado + `gap` --
 * reproduce `currentY = lastAutoTable.finalY + gap` de los 4 generadores
 * reales, donde la tabla de ítems puede tener 1 o 50 filas. Si esa `y`
 * efectiva no entra en la página (menos margen inferior), se agrega una
 * página nueva antes de dibujar -- solo para elementos encadenados: uno sin
 * `flowAfter` conserva el comportamiento exacto de Bloques 1-6 (se dibuja en
 * su `y`, sin salto de página automático).
 */
export function renderFromTemplate(
  doc: jsPDF,
  template: PdfTemplate,
  data: Record<string, unknown>,
  resolveColor: (token: string) => [number, number, number]
): void {
  // Bloque 7: un elemento entero puede estar condicionado a los datos
  // (NOTAS solo si hay texto, IVA solo si iva_activo) -- se descarta antes
  // de separar sticky/flujo, así no se dibuja ni ocupa espacio en ninguno.
  const visibleElements = template.elements.filter(
    el => !el.visibleIf || Boolean(getByPath(data, el.visibleIf))
  )
  const stickyEls = visibleElements.filter(isStickyRenderable)
  const flowEls = visibleElements.filter(el => !isStickyRenderable(el))
  const sortedFlow = sortFlowElements(flowEls)

  const computedBottom = new Map<string, number>()
  // Todos los elementos, visibles u ocultos por `visibleIf` -- necesario para
  // saltar un ancestro oculto en la cadena de `flowAfter` (ej. NOTAS vacío:
  // GENERALES debe encadenar directo después del banner, no caer a una `y`
  // fija).
  const allById = new Map(template.elements.map(el => [el.id, el]))

  /** Bordes inferior real de `id`, saltando hacia arriba por `flowAfter` si
   * `id` no se renderizó (oculto). `undefined` si no hay ningún ancestro
   * visible en la cadena -- ahí `resolveY` cae a la `y` fija del elemento. */
  function resolveFlowTarget(id: string): number | undefined {
    if (computedBottom.has(id)) return computedBottom.get(id)
    const target = allById.get(id)
    return target?.flowAfter !== undefined ? resolveFlowTarget(target.flowAfter) : undefined
  }

  function resolveY(el: PdfElement, estimatedHeight: number): number {
    let y = el.y
    if (el.flowAfter !== undefined) {
      const bottom = resolveFlowTarget(el.flowAfter)
      if (bottom !== undefined) y = bottom + (el.gap ?? 0)
    }
    if (
      el.flowAfter !== undefined &&
      y + estimatedHeight > template.page.height - template.page.margins.bottom
    ) {
      doc.addPage()
      y = template.page.margins.top
    }
    return y
  }

  for (const el of sortedFlow) {
    switch (el.type) {
      case 'text': {
        const text = el.upper ? interpolateText(el.text, data).toUpperCase() : interpolateText(el.text, data)
        const height = measureTextBlockHeight(doc, text, el.size, el.bold, el.w)
        const y = resolveY(el, height)
        const elAtY = { ...el, y }
        drawTextBackground(doc, elAtY, resolveColor)
        renderText(doc, buildSpikeText(elAtY, data, resolveColor))
        computedBottom.set(el.id, y + height)
        break
      }
      case 'line': {
        const y = resolveY(el, 0)
        renderLine(doc, buildSpikeLine({ ...el, y }, resolveColor))
        computedBottom.set(el.id, y)
        break
      }
      case 'image': {
        const h = el.h ?? el.w
        const y = resolveY(el, h)
        const image = buildSpikeImage({ ...el, y })
        if (image) renderImage(doc, image)
        computedBottom.set(el.id, y + h)
        break
      }
      case 'table': {
        const y = resolveY(el, 0)
        const finalY = renderTableElement(doc, { ...el, y }, data, resolveColor)
        computedBottom.set(el.id, finalY)
        break
      }
      case 'totals-banner': {
        const visibleRows = el.rows.filter(row => !row.visibleIf || Boolean(getByPath(data, row.visibleIf)))
        const height = computeBannerHeight(visibleRows.length)
        const y = resolveY(el, height)
        renderTotalsBanner(doc, { ...el, y }, data, resolveColor, height, visibleRows)
        computedBottom.set(el.id, y + height)
        break
      }
    }
  }

  const sticky = stickyEls
    .map(el => buildStickyElement(el, data, resolveColor))
    .filter((el): el is StickyElement => el !== null)

  redrawSticky(doc, template.page, sticky)
}
