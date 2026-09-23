/**
 * Generador de PDF de Orden de pago - Server-side
 *
 * Diseño: "Orden de pago PDF.dc.html" (Claude Design, misma familia que
 * Cotización, 2026-09-23). Coordenadas en mm, texto en pt. Dibujo manual con
 * jsPDF y los helpers compartidos de pdf-draw.ts.
 *
 * Paginación:
 * - Un proveedor empieza solo si caben su banda, el título del primer evento,
 *   el encabezado de tabla y las 2 primeras filas.
 * - Un evento empieza solo si caben título + encabezado + 2 primeras filas; si
 *   no, página nueva que abre con la banda "cont." del proveedor.
 * - Evento partido: la página siguiente abre con banda "cont." (nombre + CLABE
 *   + banco), título del evento con "· cont." y encabezado de tabla repetido.
 * - Una fila nunca se parte. La última fila de un evento viaja con su total;
 *   si es el último evento, también con el total del proveedor, y si es el
 *   último proveedor, con el total general.
 * - Páginas siguientes: encabezado compacto. Todas: pie "Página N de M".
 */

import { jsPDF } from 'jspdf'
import { OrdenPagoPreviewResult, OrdenPagoPreviewResponsable } from '@/lib/server/ordenes-pago/build'
import { getIsoLogoBase64, getSerenataLogoBase64, ISO_RATIO, SERENATA_RATIO } from '@/lib/server/pdf/cotizacion-pdf-helpers'
import { formatDateDisplay } from '@/lib/format-date'
import {
  PT,
  type FontKind,
  type RGB,
  centerBaseline,
  ellipsize,
  hline,
  registerFonts,
  trackedText,
  wrapLines,
} from '@/lib/server/pdf/pdf-draw'

// Paleta del diseño (solo estos colores)
const C = {
  ink: [29, 29, 31] as RGB, // #1D1D1F
  body: [58, 58, 60] as RGB, // #3A3A3C
  secondary: [110, 110, 115] as RGB, // #6E6E73
  onDark: [152, 152, 157] as RGB, // #98989D
  structural: [210, 210, 215] as RGB, // #D2D2D7
  hairline: [229, 229, 234] as RGB, // #E5E5EA
  accent: [254, 123, 1] as RGB, // #FE7B01
  providerTotal: [237, 164, 0] as RGB, // #EDA400
  white: [255, 255, 255] as RGB,
}

// Retícula (mm)
const MARGIN = 13 // bandas y cajas: x 13 → 197
const BAND_W = 184
const TEXT_L = 21 // texto: x 21 → 189
const TEXT_R = 189
const TEXT_W = TEXT_R - TEXT_L // 168
const BOTTOM = 278
const FIRST_CONTENT_Y = 38
const CONT_CONTENT_Y = 29
const TRACK = 0.36 * PT // 0.06em a 6 pt

// Tabla
const COL_DESC_W = 112 // texto envuelto; la columna mide 116
const COL_QTY_CENTER = 146
const ROW_PAD = 1.4
const ROW_LH = 3.7

// Altos de bloque (alto + espacio posterior)
const H_EVENT_TITLE = 7
const H_TABLE_HEAD = 6
const H_EVENT_TOTAL = 7
const GAP_EVENT_TOTAL = 4
const H_PROVIDER_TOTAL = 8
const GAP_PROVIDER_TOTAL = 6
const H_GRAND = 13

/** Moneda del diseño: "$7,000.00" (sin espacio tras el signo). */
const money = (n: number) =>
  '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** CLABE agrupada 3-3-11-1. */
const clabeFmt = (c: string) =>
  c.length === 18 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6, 17)} ${c.slice(17)}` : c

/** El sufijo societario no se separa del nombre al partir líneas. */
const keepSuffix = (name: string) =>
  name.replace(/,? (S\.A\.P\.I\. de C\.V\.|S\.A\. de C\.V\.|S\. de R\.L\. de C\.V\.|S\.C\.)$/, (m) => m.replace(/ /g, '\u00A0'))

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

type Block =
  | { kind: 'provider'; p: OrdenPagoPreviewResponsable; nameLines: string[]; h: number }
  | { kind: 'cont'; p: OrdenPagoPreviewResponsable; nameLines: string[]; clabeLine: string; h: number }
  | { kind: 'event'; project: string; folio: string; entrega: string | null; cont: boolean; h: number }
  | { kind: 'head'; h: number }
  | { kind: 'row'; descLines: string[]; qty: string; amount: string; h: number }
  | { kind: 'eventTotal'; amount: string; h: number }
  | { kind: 'providerTotal'; amount: string; h: number }
  | { kind: 'grand'; amount: string; summary: string; h: number }

export function generateOrdenPagoPdf(preview: OrdenPagoPreviewResult): ArrayBuffer {
  // compress: jsPDF incrusta los PNG decodificados como RGB crudo (el isotipo
  // de 4 KB ocupaba ~590 KB); Flate sin pérdida baja el PDF ~95% sin cambio visual.
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
  const fonts = registerFonts(doc)
  const isoLogoPng = getIsoLogoBase64()
  const serenataLogoPng = getSerenataLogoBase64()
  const fecha = formatDateDisplay(new Date())
  const f = (kind: FontKind, size: number) => fonts.set(doc, kind, size)

  // ── Medición ──
  const rowH = (lines: number) => 2 * ROW_PAD + ROW_LH * lines

  const paymentFields = (p: OrdenPagoPreviewResponsable) => {
    const r = p.responsable
    const out: Array<{ label: string; value: string; kind: FontKind; size: number }> = []
    if (r.clabe) out.push({ label: 'CLABE', value: clabeFmt(r.clabe), kind: 'semibold', size: 9 })
    if (r.banco) out.push({ label: 'BANCO', value: r.banco, kind: 'semibold', size: 9 })
    if (r.correo) out.push({ label: 'CORREO', value: r.correo, kind: 'regular', size: 8 })
    return out
  }

  const providerBlock = (p: OrdenPagoPreviewResponsable): Block => {
    f('bold', 10)
    const nameLines = doc.splitTextToSize(keepSuffix(p.responsable.nombre), TEXT_W) as string[]
    const h = 3 + 4.4 * nameLines.length + (paymentFields(p).length ? 2 + 3.5 : 0) + 3
    return { kind: 'provider', p, nameLines, h }
  }

  const contBlock = (p: OrdenPagoPreviewResponsable): Block => {
    const r = p.responsable
    const clabeLine = r.clabe ? `CLABE ${clabeFmt(r.clabe)}${r.banco ? ' · ' + r.banco : ''}` : r.banco || ''
    f('regular', 7)
    const clabeW = clabeLine ? doc.getTextWidth(clabeLine) : 0
    const contW = doc.getTextWidth(' cont.')
    f('semibold', 8.5)
    const maxW = TEXT_W - (clabeLine ? 6 + clabeW : 0)
    const nameLines = doc.splitTextToSize(keepSuffix(r.nombre), maxW) as string[]
    const last = nameLines[nameLines.length - 1]
    if (nameLines.length && doc.getTextWidth(last) + contW > maxW) {
      const words = last.split(' ')
      if (words.length > 1) nameLines.splice(-1, 1, words.slice(0, -1).join(' '), words[words.length - 1])
    }
    return { kind: 'cont', p, nameLines, clabeLine, h: 3.2 + 3.8 * nameLines.length }
  }
  const CONT_GAP = 2
  const PROVIDER_GAP = 3

  const pages: Block[][] = [[]]
  let y = FIRST_CONTENT_Y
  const page = () => pages[pages.length - 1]
  const fits = (h: number) => y + h <= BOTTOM
  const newPage = () => {
    pages.push([])
    y = CONT_CONTENT_Y
  }
  const put = (b: Block, after = 0) => {
    page().push(b)
    y += b.h + after
  }

  const nResp = preview.responsables.length
  preview.responsables.forEach((p, pi) => {
    const rowsOf = (e: (typeof p.eventos)[number]) =>
      e.items.map((it) => {
        f('regular', 8.5)
        const descLines = wrapLines(doc, it.descripcion || '', COL_DESC_W)
        return { descLines, qty: String(it.cantidad), amount: money(it.monto), h: rowH(Math.max(descLines.length, 1)) }
      })
    const firstRows = (rows: Array<{ h: number }>) => rows.slice(0, 2).reduce((s, r) => s + r.h, 0)
    const eventBlock = (e: (typeof p.eventos)[number], cont: boolean): Block => ({
      kind: 'event',
      project: e.proyecto,
      folio: e.cotizacion_folio,
      entrega: e.fecha_entrega ? formatDateDisplay(e.fecha_entrega) : null,
      cont,
      h: H_EVENT_TITLE,
    })
    const cont = contBlock(p)
    const putCont = () => put(cont, CONT_GAP)

    const prov = providerBlock(p)
    const firstEventRows = p.eventos[0] ? rowsOf(p.eventos[0]) : []
    if (!fits(prov.h + PROVIDER_GAP + H_EVENT_TITLE + H_TABLE_HEAD + firstRows(firstEventRows)) && page().length) newPage()
    put(prov, PROVIDER_GAP)

    p.eventos.forEach((e, ei) => {
      const rows = rowsOf(e)
      const lastEv = ei === p.eventos.length - 1
      if (!fits(H_EVENT_TITLE + H_TABLE_HEAD + firstRows(rows))) {
        newPage()
        putCont()
      }
      put(eventBlock(e, false))
      put({ kind: 'head', h: H_TABLE_HEAD })
      rows.forEach((r, ri) => {
        const last = ri === rows.length - 1
        const need =
          r.h +
          (last
            ? H_EVENT_TOTAL +
              (lastEv ? GAP_EVENT_TOTAL + H_PROVIDER_TOTAL + (pi === nResp - 1 ? GAP_PROVIDER_TOTAL + H_GRAND : 0) : 0)
            : 0)
        if (!fits(need)) {
          newPage()
          putCont()
          put(eventBlock(e, true))
          put({ kind: 'head', h: H_TABLE_HEAD })
        }
        put({ kind: 'row', ...r })
      })
      put({ kind: 'eventTotal', amount: money(e.subtotal), h: H_EVENT_TOTAL }, GAP_EVENT_TOTAL)
    })
    put({ kind: 'providerTotal', amount: money(p.total_responsable), h: H_PROVIDER_TOTAL }, GAP_PROVIDER_TOTAL)
  })

  const { resumen } = preview
  const summary = [
    plural(resumen.responsables, 'proveedor', 'proveedores'),
    plural(resumen.eventos, 'evento', 'eventos'),
    plural(resumen.items_totales, 'concepto', 'conceptos'),
  ].join(' · ')
  if (!fits(H_GRAND) && page().length) newPage()
  put({ kind: 'grand', amount: money(resumen.total_general), summary, h: H_GRAND })

  // ── Dibujo ──
  const label = (text: string, x: number, by: number, color: RGB, align: 'left' | 'right' = 'left') => {
    f('bold', 6)
    doc.setTextColor(...color)
    return trackedText(doc, text, x, by, TRACK, align)
  }

  const drawFirstHeader = () => {
    f('bold', 18)
    doc.setTextColor(...C.ink)
    doc.text('Orden de pago', TEXT_L, 13 + 0.8635 * 18 * PT)
    if (serenataLogoPng) {
      try {
        const w = 28
        doc.addImage(serenataLogoPng, 'PNG', TEXT_R - w, 15.6, w, w / SERENATA_RATIO)
      } catch (e) {
        console.warn('Error añadiendo logo Serenata:', e)
      }
    }
    const genBy = 20.5 + 0.8635 * 8.5 * PT
    const lw = label('GENERADO', TEXT_L, genBy, C.secondary)
    f('semibold', 8.5)
    doc.setTextColor(...C.ink)
    doc.text(fecha, TEXT_L + lw + 1.5, genBy)

    doc.setDrawColor(...C.structural)
    doc.setLineWidth(0.2)
    doc.roundedRect(MARGIN, 26.5, BAND_W, 8, 2, 2, 'S')
    const cy = 30.5
    const stat = (text: string, value: string, x: number) => {
      const w = label(text, x, centerBaseline(cy, 6), C.secondary)
      f('bold', 11)
      doc.setTextColor(...C.ink)
      doc.text(value, x + w + 2, centerBaseline(cy, 11))
    }
    stat('PROVEEDORES', String(resumen.responsables), 21)
    stat('EVENTOS', String(resumen.eventos), 58)
    stat('CONCEPTOS', String(resumen.items_totales), 95)
    f('bold', 11)
    doc.setTextColor(...C.ink)
    const total = money(resumen.total_general)
    doc.text(total, TEXT_R, centerBaseline(cy, 11), { align: 'right' })
    label('TOTAL GENERAL', TEXT_R - doc.getTextWidth(total) - 2, centerBaseline(cy, 6), C.secondary, 'right')
  }

  const drawCompactHeader = () => {
    if (isoLogoPng) {
      try {
        doc.addImage(isoLogoPng, 'PNG', TEXT_L, 13, 7, 7 / ISO_RATIO)
      } catch (e) {
        console.warn('Error añadiendo logo ISO:', e)
      }
    }
    f('bold', 10)
    doc.setTextColor(...C.ink)
    doc.text('Orden de pago', 31, centerBaseline(16.5, 10))
    f('regular', 8)
    doc.setTextColor(...C.secondary)
    doc.text(fecha, TEXT_R, centerBaseline(16.5, 8), { align: 'right' })
    hline(doc, 24, MARGIN, MARGIN + BAND_W, 0.2, C.structural)
  }

  const drawProvider = (b: Extract<Block, { kind: 'provider' }>, top: number) => {
    doc.setFillColor(...C.ink)
    doc.roundedRect(MARGIN, top, BAND_W, b.h, 2, 2, 'F')
    f('bold', 10)
    doc.setTextColor(...C.white)
    b.nameLines.forEach((line, i) => {
      doc.text(line, TEXT_L, centerBaseline(top + 3 + i * 4.4 + 2.2, 10))
    })
    const fields = paymentFields(b.p)
    if (!fields.length) return
    const rowCenter = top + 3 + 4.4 * b.nameLines.length + 2 + 1.75
    const by = centerBaseline(rowCenter, 9)
    let x = TEXT_L
    fields.forEach((fld, i) => {
      if (i > 0) x += 5
      x += label(fld.label, x, by, C.onDark) + 1.5
      f(fld.kind, fld.size)
      doc.setTextColor(...C.white)
      const maxW = TEXT_R - x
      const value = ellipsize(doc, fld.value, maxW)
      doc.text(value, x, by)
      x += doc.getTextWidth(value)
    })
  }

  const drawCont = (b: Extract<Block, { kind: 'cont' }>, top: number) => {
    doc.setFillColor(...C.ink)
    doc.roundedRect(MARGIN, top, BAND_W, b.h, 2, 2, 'F')
    b.nameLines.forEach((line, i) => {
      const by = centerBaseline(top + 1.6 + i * 3.8 + 1.9, 8.5)
      f('semibold', 8.5)
      doc.setTextColor(...C.white)
      doc.text(line, TEXT_L, by)
      if (i === b.nameLines.length - 1) {
        const w = doc.getTextWidth(line)
        f('regular', 7)
        doc.setTextColor(...C.onDark)
        doc.text(' cont.', TEXT_L + w, by)
      }
    })
    if (b.clabeLine) {
      f('regular', 7)
      doc.setTextColor(...C.onDark)
      doc.text(b.clabeLine, TEXT_R, centerBaseline(top + 1.6 + 1.9, 7), { align: 'right' })
    }
  }

  const drawEvent = (b: Extract<Block, { kind: 'event' }>, top: number) => {
    // Textos apoyados a 1.5 mm del fondo del bloque (CSS line-height 1).
    const byFor = (size: number) => top + H_EVENT_TITLE - 1.5 - 0.1365 * size * PT
    let rightX = TEXT_R
    if (b.entrega) {
      f('semibold', 8.5)
      doc.setTextColor(...C.ink)
      doc.text(b.entrega, TEXT_R, byFor(8.5), { align: 'right' })
      rightX -= doc.getTextWidth(b.entrega) + 1.5
      rightX -= label('ENTREGA', rightX, byFor(8.5), C.secondary, 'right') + 4
    }
    const folioText = ` · ${b.folio}${b.cont ? ' · cont.' : ''}`
    f('regular', 8.5)
    const folioW = doc.getTextWidth(folioText)
    f('semibold', 9.5)
    doc.setTextColor(...C.ink)
    const project = ellipsize(doc, b.project, rightX - TEXT_L - folioW)
    doc.text(project, TEXT_L, byFor(9.5))
    const px = TEXT_L + doc.getTextWidth(project)
    f('regular', 8.5)
    doc.setTextColor(...C.secondary)
    doc.text(folioText, px, byFor(8.5))
  }

  const drawHead = (top: number) => {
    const by = centerBaseline(top + H_TABLE_HEAD / 2, 6)
    label('CARGO / DESCRIPCIÓN', TEXT_L, by, C.secondary)
    f('bold', 6)
    doc.setTextColor(...C.secondary)
    trackedText(doc, 'CANTIDAD', COL_QTY_CENTER, by, TRACK, 'center')
    label('MONTO', TEXT_R, by, C.secondary, 'right')
    hline(doc, top + H_TABLE_HEAD, TEXT_L, TEXT_R, 0.2, C.ink)
  }

  const drawRow = (b: Extract<Block, { kind: 'row' }>, top: number) => {
    const by = centerBaseline(top + ROW_PAD + ROW_LH / 2, 8.5)
    f('regular', 8.5)
    doc.setTextColor(...C.body)
    b.descLines.forEach((line, i) => doc.text(line, TEXT_L, by + i * ROW_LH))
    doc.text(b.qty, COL_QTY_CENTER, by, { align: 'center' })
    doc.setTextColor(...C.ink)
    doc.text(b.amount, TEXT_R, by, { align: 'right' })
    hline(doc, top + b.h, TEXT_L, TEXT_R, 0.1, C.hairline)
  }

  const drawEventTotal = (b: Extract<Block, { kind: 'eventTotal' }>, top: number) => {
    const cy = top + H_EVENT_TOTAL / 2
    f('semibold', 7)
    doc.setTextColor(...C.secondary)
    doc.text('Total del evento', 155, centerBaseline(cy, 7), { align: 'right' })
    f('semibold', 8.5)
    doc.setTextColor(...C.ink)
    doc.text(b.amount, TEXT_R, centerBaseline(cy, 8.5), { align: 'right' })
  }

  const drawProviderTotal = (b: Extract<Block, { kind: 'providerTotal' }>, top: number) => {
    doc.setFillColor(...C.providerTotal)
    doc.rect(MARGIN, top, BAND_W, H_PROVIDER_TOTAL, 'F')
    hline(doc, top + 0.2, MARGIN, MARGIN + BAND_W, 0.4, C.ink)
    const cy = top + H_PROVIDER_TOTAL / 2
    doc.setTextColor(...C.ink)
    f('bold', 9)
    doc.text('Total del proveedor', TEXT_L, centerBaseline(cy, 9))
    f('bold', 10.5)
    doc.text(b.amount, TEXT_R, centerBaseline(cy, 10.5), { align: 'right' })
  }

  const drawGrand = (b: Extract<Block, { kind: 'grand' }>, top: number) => {
    doc.setFillColor(...C.ink)
    doc.roundedRect(MARGIN, top, BAND_W, H_GRAND, 3, 3, 'F')
    f('bold', 8)
    doc.setTextColor(...C.white)
    trackedText(doc, 'TOTAL GENERAL', TEXT_L, centerBaseline(top + 4.6, 8), 0.48 * PT)
    f('regular', 7)
    doc.setTextColor(...C.onDark)
    doc.text(b.summary, TEXT_L, centerBaseline(top + 8.6, 7))
    const by = centerBaseline(top + 6.5, 16)
    f('bold', 16)
    doc.setTextColor(...C.accent)
    doc.text(b.amount, TEXT_R, by, { align: 'right' })
    const aw = doc.getTextWidth(b.amount)
    f('semibold', 8)
    doc.setTextColor(...C.onDark)
    doc.text('MXN', TEXT_R - aw - 2, by, { align: 'right' })
  }

  pages.forEach((blocks, pi) => {
    if (pi > 0) doc.addPage()
    if (pi === 0) drawFirstHeader()
    else drawCompactHeader()
    let top = pi === 0 ? FIRST_CONTENT_Y : CONT_CONTENT_Y
    blocks.forEach((b) => {
      switch (b.kind) {
        case 'provider':
          drawProvider(b, top)
          top += b.h + PROVIDER_GAP
          break
        case 'cont':
          drawCont(b, top)
          top += b.h + CONT_GAP
          break
        case 'event':
          drawEvent(b, top)
          top += b.h
          break
        case 'head':
          drawHead(top)
          top += b.h
          break
        case 'row':
          drawRow(b, top)
          top += b.h
          break
        case 'eventTotal':
          drawEventTotal(b, top)
          top += b.h + GAP_EVENT_TOTAL
          break
        case 'providerTotal':
          drawProviderTotal(b, top)
          top += b.h + GAP_PROVIDER_TOTAL
          break
        case 'grand':
          drawGrand(b, top)
          top += b.h
          break
      }
    })
  })

  // ── Pie en todas las páginas ──
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    hline(doc, 284, MARGIN, MARGIN + BAND_W, 0.2, C.structural)
    f('regular', 7)
    doc.setTextColor(...C.secondary)
    doc.text(`Serenata House Entertainment · Orden de pago · Página ${i} de ${total}`, TEXT_L, centerBaseline(288, 7))
  }

  return doc.output('arraybuffer') as ArrayBuffer
}
