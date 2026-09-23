/**
 * Generador de PDF de Cotización - Server-side
 *
 * Diseño: "Cotizacion PDF.dc.html" (Claude Design, design system Apple-style
 * Serenata, 2026-09-23). Coordenadas en mm, tamaños de texto en pt. Dibujo
 * manual con jsPDF (sin autotable) para controlar paginación, hairlines y
 * alineación exacta sobre los dos márgenes de texto (x 21 y x 189).
 *
 * Paginación:
 * - Una fila nunca se parte entre páginas; el encabezado de columnas se repite.
 * - Un grupo no empieza en una página si no caben al menos 2 de sus filas.
 * - Si un grupo continúa, la primera fila de la nueva página repite la
 *   categoría con "cont." debajo; el total de categoría queda en la original.
 * - Banda de totales + Notas + Generales se mueven juntas; si no caben, pasan
 *   a la siguiente página arrastrando las 2 últimas filas de la tabla.
 * - Páginas siguientes: encabezado compacto. Todas: pie con "Página N de M".
 */

import { jsPDF } from 'jspdf'
import { CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf-types'
import { formatCurrencyPdf } from '@/lib/server/pdf/pdf-base-config'
import { formatDateDisplay } from '@/lib/format-date'
import {
  ISO_RATIO,
  SERENATA_RATIO,
  calculateDiscount,
  getCancelacionText,
  getCostosText,
  getGeneralesText,
  getIsoLogoBase64,
  getSerenataLogoBase64,
} from '@/lib/server/pdf/cotizacion-pdf-helpers'
import {
  PT,
  type FontKind,
  type RGB,
  baseline,
  countLines,
  drawJustified,
  ellipsize,
  hline,
  registerFonts,
  trackedText,
} from '@/lib/server/pdf/pdf-draw'

// Paleta del diseño (solo estos colores)
const C = {
  ink: [29, 29, 31] as RGB, // #1D1D1F
  body: [58, 58, 60] as RGB, // #3A3A3C
  secondary: [110, 110, 115] as RGB, // #6E6E73
  tertiary: [152, 152, 157] as RGB, // #98989D
  labelOnDark: [161, 161, 166] as RGB, // #A1A1A6
  dividerOnDark: [72, 72, 74] as RGB, // #48484A
  groupStart: [199, 199, 204] as RGB, // #C7C7CC
  sectionDivider: [210, 210, 215] as RGB, // #D2D2D7
  hairline: [229, 229, 234] as RGB, // #E5E5EA
  accent: [254, 123, 1] as RGB, // #FE7B01
  discount: [255, 204, 77] as RGB, // #FFCC4D
  white: [255, 255, 255] as RGB,
}

// Retícula (mm)
const PAGE_W = 210
const MARGIN = 13 // bandas y líneas: x 13 → 197
const BAND_W = PAGE_W - 2 * MARGIN // 184
const TEXT_L = 21 // texto: x 21 → 189
const TEXT_R = 189
const TEXT_W = TEXT_R - TEXT_L // 168
const LIMIT_Y = 278
const FIRST_BAND_Y = 16
const CONT_CONTENT_Y = 31
const TRACK = 0.4 * PT // tracking de etiquetas en mayúsculas (0.06em a 6.5 pt)

// Tabla
const COL = {
  cat: { x: 21, w: 30 },
  desc: { x: 51, w: 61 },
  qtyCenter: 117.5,
  unitRight: 145,
  amountRight: 167,
  totalRight: 189,
}
const COL_HEADER_H = 6.5
const ROW_PAD = 1.6
const ROW_LH = 3.8
const CONT_LH = 3
const GROUP_GAP = 2.5
const TABLE_TO_TOTALS = 8

interface Row {
  cat: string
  catLines: string[]
  descLines: string[]
  qty: string
  unit: string
  amount: string
  noPrice: boolean
  groupFirst: boolean
  groupTotal: string
}

interface PlacedRow extends Row {
  showCat: boolean
  cont: boolean
  gapBefore: boolean
  border: 'none' | 'group' | 'row'
  h: number
}

export function generateCotizacionPdf(data: CotizacionPDFData): ArrayBuffer {
  // compress: jsPDF incrusta los PNG decodificados como RGB crudo (el isotipo
  // de 4 KB ocupaba ~590 KB); Flate sin pérdida baja el PDF ~95% sin cambio visual.
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true })
  const fonts = registerFonts(doc)
  const isoLogoPng = getIsoLogoBase64()
  const serenataLogoPng = getSerenataLogoBase64()
  const descuento = calculateDiscount(data)

  // ── Filas de la tabla, agrupadas por categoría en orden de aparición ──
  const categories: string[] = []
  data.items.forEach((item) => {
    if (!categories.includes(item.categoria)) categories.push(item.categoria)
  })
  const groups: Row[][] = categories.map((cat) => {
    const catItems = data.items.filter((i) => i.categoria === cat)
    const catTotal = catItems.reduce((s, i) => s + (i.importe || 0), 0)
    fonts.set(doc, 'semibold', 8)
    const catLines: string[] = doc.splitTextToSize(cat || '', COL.cat.w - 2)
    return catItems.map((item, idx) => {
      const noPrice = !item.precio_unitario || !item.cantidad
      fonts.set(doc, 'regular', 8)
      return {
        cat,
        catLines,
        descLines: doc.splitTextToSize(item.descripcion || '', COL.desc.w - 2),
        qty: item.cantidad ? String(item.cantidad) : '',
        unit: noPrice ? '$ - ,00' : formatCurrencyPdf(item.precio_unitario),
        amount: noPrice ? '$ - ,00' : formatCurrencyPdf(item.importe),
        noPrice,
        groupFirst: idx === 0,
        groupTotal: idx === 0 ? formatCurrencyPdf(catTotal) : '',
      }
    })
  })

  const place = (r: Row, firstOnPage: boolean): PlacedRow => {
    const showCat = r.groupFirst || firstOnPage
    const cont = !r.groupFirst && firstOnPage
    const catH = showCat ? r.catLines.length * ROW_LH + (cont ? CONT_LH : 0) : 0
    const contentH = Math.max(r.descLines.length * ROW_LH, catH, ROW_LH)
    const gapBefore = r.groupFirst && !firstOnPage
    return {
      ...r,
      showCat,
      cont,
      gapBefore,
      border: firstOnPage ? 'none' : r.groupFirst ? 'group' : 'row',
      h: 2 * ROW_PAD + contentH + (gapBefore ? GROUP_GAP : 0),
    }
  }

  // ── Encabezado de la página 1 (medición) ──
  const headerFields: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Cliente', value: data.cliente || '—' },
    { label: 'Proyecto', value: data.proyecto || '—' },
    { label: 'Locación', value: data.locacion || '—' },
    { label: 'Fecha de entrega', value: formatDateDisplay(data.fecha_entrega) },
    { label: 'Fecha de cotización', value: formatDateDisplay(data.fecha_cotizacion) },
    { label: '# Cotización', value: data.id, accent: true },
  ]
  const HDR_PAD_V = 4
  const HDR_LABEL_W = 32
  const HDR_GAP = 3
  const HDR_ROW_GAP = 1.5
  const HDR_LH = 4.2
  const LOGO_SIZE = 32.3 // 122 px del diseño
  const hdrValueX = TEXT_L + HDR_LABEL_W + HDR_GAP
  const hdrValueW = TEXT_R - LOGO_SIZE - 8 - hdrValueX
  fonts.set(doc, 'semibold', 8.5)
  const hdrValues = headerFields.map((f) => doc.splitTextToSize(f.value, hdrValueW) as string[])
  const hdrColH =
    hdrValues.reduce((s, v) => s + v.length * HDR_LH, 0) + (headerFields.length - 1) * HDR_ROW_GAP
  const hdrBandH = Math.max(hdrColH, LOGO_SIZE) + 2 * HDR_PAD_V
  const firstTableY = FIRST_BAND_Y + hdrBandH + 9 + 5 + 3 // banda + aire + "Resumen" + aire

  // ── Bloque final (medición): totales + notas + generales ──
  const totals: Array<{ label: string; value: string; kind: 'normal' | 'general' | 'discount' }> = [
    { label: 'Subtotal', value: formatCurrencyPdf(data.subtotal), kind: 'normal' },
    { label: 'Fee de agencia', value: formatCurrencyPdf(data.fee_agencia), kind: 'normal' },
    { label: 'General', value: formatCurrencyPdf(data.general), kind: 'general' },
  ]
  if (descuento > 0) totals.push({ label: 'Descuento', value: `− ${formatCurrencyPdf(descuento)}`, kind: 'discount' })
  if (data.iva_activo) totals.push({ label: 'IVA (16%)', value: formatCurrencyPdf(data.iva), kind: 'normal' })
  const T_ROW = 4.3
  const T_GENERAL = 5
  const T_SEP = 0.8
  const totalsInnerH =
    totals.reduce((s, t) => s + (t.kind === 'general' ? T_GENERAL + 2 * T_SEP : T_ROW), 0) + 1.5 + 1.5 + 6
  const totalsBandH = totalsInnerH + 2 * HDR_PAD_V

  const notas = (data.notas || '').trim()
  const NOTES_X = 51
  const NOTES_W = 138
  fonts.set(doc, 'regular', 8.5)
  const notesH = notas ? 9 + 4 + Math.max(countLines(doc, notas, NOTES_W), 1) * 4.2 : 0

  const generales = getGeneralesText()
  const LEGAL_LH = 3.1
  fonts.set(doc, 'semibold', 6.5)
  const g1 = countLines(doc, generales.line1, TEXT_W)
  fonts.set(doc, 'regular', 6.5)
  const g2 = countLines(doc, generales.line2, TEXT_W)
  const gCancel = countLines(doc, getCancelacionText(), TEXT_W)
  const gCostos = countLines(doc, getCostosText(), TEXT_W)
  const generalesH =
    9 + 4 + 4.2 + 2 + (g1 + g2) * LEGAL_LH + 2.5 + (LEGAL_LH + 1.2 + gCancel * LEGAL_LH) + 2.5 + (LEGAL_LH + 1.2 + gCostos * LEGAL_LH)
  const blockH = totalsBandH + notesH + generalesH

  // ── Paginación de la tabla ──
  const pages: PlacedRow[][] = [[]]
  let y = firstTableY + COL_HEADER_H
  for (const group of groups) {
    group.forEach((r, idx) => {
      const cur = pages[pages.length - 1]
      let placed = place(r, cur.length === 0)
      let need = placed.h
      // Un grupo no empieza si no caben al menos 2 de sus filas
      if (idx === 0 && group.length > 1 && cur.length > 0) {
        need += place(group[1], false).h
      }
      if (y + need > LIMIT_Y && cur.length > 0) {
        pages.push([])
        y = CONT_CONTENT_Y + COL_HEADER_H
        placed = place(r, true)
      }
      pages[pages.length - 1].push(placed)
      y += placed.h
    })
  }

  // ¿Cabe el bloque final después de la tabla?
  let lastPage = pages[pages.length - 1]
  const hasRows = lastPage.length > 0
  let blockOnNewPage = false
  if (y + (hasRows ? TABLE_TO_TOTALS : 0) + blockH > LIMIT_Y) {
    if (lastPage.length > 2) {
      const moved = lastPage.splice(-2)
      const np = moved.map((r, i) => place(r, i === 0))
      pages.push(np)
      lastPage = np
      y = CONT_CONTENT_Y + COL_HEADER_H + np.reduce((s, r) => s + r.h, 0)
    } else {
      blockOnNewPage = true
    }
  }

  // ── Dibujo ──
  const drawCompactHeader = () => {
    const top = 14
    if (isoLogoPng) {
      try {
        doc.addImage(isoLogoPng, 'PNG', MARGIN, top, 7, 7 / ISO_RATIO)
      } catch (e) {
        console.warn('Error añadiendo logo ISO:', e)
      }
    }
    const tx = MARGIN + 7 + 3
    fonts.set(doc, 'semibold', 6.5)
    doc.setTextColor(...C.tertiary)
    const contW = trackedText(doc, 'CONTINUACIÓN', MARGIN + BAND_W, baseline(top, 3.8), TRACK, 'right')
    fonts.set(doc, 'semibold', 9)
    doc.setTextColor(...C.ink)
    doc.text(`Cotización ${data.id}`, tx, baseline(top, 3.8))
    fonts.set(doc, 'regular', 7)
    doc.setTextColor(...C.secondary)
    const sub = ellipsize(doc, `${data.cliente} · ${data.proyecto}`, MARGIN + BAND_W - contW - 3 - tx)
    doc.text(sub, tx, baseline(top + 3.8 + 0.6, 3))
    hline(doc, 25, MARGIN, MARGIN + BAND_W, 0.2, C.sectionDivider)
  }

  const drawColumnHeader = (top: number) => {
    fonts.set(doc, 'semibold', 6.5)
    doc.setTextColor(...C.secondary)
    const by = top + COL_HEADER_H - 1.6 - 3 + 0.72 * 3
    trackedText(doc, 'CATEGORÍA', COL.cat.x, by, TRACK)
    trackedText(doc, 'DESCRIPCIÓN', COL.desc.x, by, TRACK)
    trackedText(doc, 'CANT.', COL.qtyCenter, by, TRACK, 'center')
    trackedText(doc, 'P. UNITARIO', COL.unitRight, by, TRACK, 'right')
    trackedText(doc, 'IMPORTE', COL.amountRight, by, TRACK, 'right')
    trackedText(doc, 'TOTAL CAT.', COL.totalRight, by, TRACK, 'right')
    hline(doc, top + COL_HEADER_H, MARGIN, MARGIN + BAND_W, 0.3, C.ink)
    return top + COL_HEADER_H
  }

  const drawRow = (r: PlacedRow, top: number) => {
    let t = top
    if (r.gapBefore) t += GROUP_GAP
    if (r.border === 'group') hline(doc, t, MARGIN, MARGIN + BAND_W, 0.2, C.groupStart)
    else if (r.border === 'row') hline(doc, t, MARGIN, MARGIN + BAND_W, 0.15, C.hairline)
    const by = t + ROW_PAD + 0.72 * ROW_LH
    if (r.showCat) {
      fonts.set(doc, 'semibold', 8)
      doc.setTextColor(...C.ink)
      doc.text(r.catLines, COL.cat.x, by, { lineHeightFactor: ROW_LH / (8 * PT) })
      if (r.cont) {
        fonts.set(doc, 'regular', 6.5)
        doc.setTextColor(...C.tertiary)
        doc.text('cont.', COL.cat.x, t + ROW_PAD + r.catLines.length * ROW_LH + 0.72 * CONT_LH)
      }
    }
    fonts.set(doc, 'regular', 8)
    doc.setTextColor(...C.body)
    doc.text(r.descLines, COL.desc.x, by, { lineHeightFactor: ROW_LH / (8 * PT) })
    doc.text(r.qty, COL.qtyCenter, by, { align: 'center' })
    doc.setTextColor(...(r.noPrice ? C.tertiary : C.body))
    doc.text(r.unit, COL.unitRight, by, { align: 'right' })
    doc.setTextColor(...(r.noPrice ? C.tertiary : C.ink))
    doc.text(r.amount, COL.amountRight, by, { align: 'right' })
    if (r.groupTotal) {
      fonts.set(doc, 'semibold', 8)
      doc.setTextColor(...C.ink)
      doc.text(r.groupTotal, COL.totalRight, by, { align: 'right' })
    }
    return top + r.h
  }

  const drawFirstHeader = () => {
    doc.setFillColor(...C.ink)
    doc.roundedRect(MARGIN, FIRST_BAND_Y, BAND_W, hdrBandH, 3, 3, 'F')
    let ty = FIRST_BAND_Y + (hdrBandH - hdrColH) / 2
    headerFields.forEach((f, i) => {
      const lines = hdrValues[i]
      const by = baseline(ty, HDR_LH)
      fonts.set(doc, 'semibold', 6.5)
      doc.setTextColor(...C.labelOnDark)
      trackedText(doc, f.label.toUpperCase(), TEXT_L, by, TRACK)
      fonts.set(doc, 'semibold', 8.5)
      doc.setTextColor(...(f.accent ? C.accent : C.white))
      doc.text(lines, hdrValueX, by, { lineHeightFactor: HDR_LH / (8.5 * PT) })
      ty += lines.length * HDR_LH + HDR_ROW_GAP
    })
    if (isoLogoPng) {
      try {
        const logoH = LOGO_SIZE / ISO_RATIO
        doc.addImage(isoLogoPng, 'PNG', TEXT_R - LOGO_SIZE, FIRST_BAND_Y + (hdrBandH - logoH) / 2, LOGO_SIZE, logoH)
      } catch (e) {
        console.warn('Error añadiendo logo ISO:', e)
      }
    }
    const resumenTop = FIRST_BAND_Y + hdrBandH + 9
    fonts.set(doc, 'bold', 11)
    doc.setTextColor(...C.ink)
    doc.text('Resumen', TEXT_L, baseline(resumenTop, 5))
  }

  // Cursor con salto de página para texto que, en el caso extremo, no cabe
  // completo en una página nueva (notas muy largas).
  let cursorY = 0
  const newPage = () => {
    doc.addPage()
    drawCompactHeader()
    cursorY = CONT_CONTENT_Y
  }
  const ensure = (h: number) => {
    if (cursorY + h > LIMIT_Y) newPage()
  }

  const drawTotalsBand = (top: number) => {
    doc.setFillColor(...C.ink)
    doc.roundedRect(MARGIN, top, BAND_W, totalsBandH, 3, 3, 'F')
    if (serenataLogoPng) {
      try {
        const w = 39.8
        const h = w / SERENATA_RATIO
        doc.addImage(serenataLogoPng, 'PNG', TEXT_L, top + (totalsBandH - h) / 2, w, h)
      } catch (e) {
        console.warn('Error añadiendo logo Serenata:', e)
      }
    }
    const bx1 = TEXT_R - 84
    let ty = top + HDR_PAD_V
    totals.forEach((t) => {
      if (t.kind === 'general') {
        ty += T_SEP
        hline(doc, ty, bx1, TEXT_R, 0.2, C.dividerOnDark)
        ty += T_SEP
        fonts.set(doc, 'semibold', 10)
        doc.setTextColor(...C.accent)
        doc.text(t.label, bx1, baseline(ty, T_GENERAL))
        doc.text(t.value, TEXT_R, baseline(ty, T_GENERAL), { align: 'right' })
        ty += T_GENERAL
        return
      }
      fonts.set(doc, 'regular', 8.5)
      doc.setTextColor(...(t.kind === 'discount' ? C.discount : C.labelOnDark))
      doc.text(t.label, bx1, baseline(ty, T_ROW))
      doc.setTextColor(...(t.kind === 'discount' ? C.discount : C.white))
      doc.text(t.value, TEXT_R, baseline(ty, T_ROW), { align: 'right' })
      ty += T_ROW
    })
    ty += 1.5
    hline(doc, ty, bx1, TEXT_R, 0.3, C.dividerOnDark)
    ty += 1.5
    const by = baseline(ty, 6)
    fonts.set(doc, 'bold', 7.5)
    doc.setTextColor(...C.white)
    trackedText(doc, 'TOTAL', bx1, by, 0.6 * PT)
    fonts.set(doc, 'bold', 14)
    doc.text(formatCurrencyPdf(data.total), TEXT_R, by, { align: 'right' })
  }

  const drawSectionTop = () => {
    ensure(9 + 4 + 4.2)
    cursorY += 9
    hline(doc, cursorY, MARGIN, MARGIN + BAND_W, 0.2, C.sectionDivider)
    cursorY += 4
  }

  const drawNotes = () => {
    if (!notas) return
    drawSectionTop()
    fonts.set(doc, 'bold', 9)
    doc.setTextColor(...C.ink)
    doc.text('Notas', TEXT_L, baseline(cursorY, 4.2))
    fonts.set(doc, 'regular', 8.5)
    doc.setTextColor(...C.body)
    const lines = notas.split('\n').flatMap((p) => doc.splitTextToSize(p, NOTES_W) as string[])
    lines.forEach((line) => {
      ensure(4.2)
      doc.text(line, NOTES_X, baseline(cursorY, 4.2))
      cursorY += 4.2
    })
  }

  const drawLegalParagraph = (text: string, kind: FontKind, color: RGB) => {
    text.split('\n').forEach((para) => {
      fonts.set(doc, kind, 6.5)
      const n = countLines(doc, para, TEXT_W)
      ensure(n * LEGAL_LH)
      doc.setTextColor(...color)
      cursorY = drawJustified(doc, para, TEXT_L, baseline(cursorY, LEGAL_LH), TEXT_W, LEGAL_LH) - 0.72 * LEGAL_LH
    })
  }

  const drawLegalSubtitle = (text: string) => {
    ensure(LEGAL_LH + 1.2 + LEGAL_LH)
    fonts.set(doc, 'bold', 6.5)
    doc.setTextColor(...C.ink)
    trackedText(doc, text, TEXT_L, baseline(cursorY, LEGAL_LH), 0.25 * PT)
    cursorY += LEGAL_LH + 1.2
  }

  const drawGenerales = () => {
    drawSectionTop()
    fonts.set(doc, 'bold', 9)
    doc.setTextColor(...C.ink)
    doc.text('Generales:', TEXT_L, baseline(cursorY, 4.2))
    cursorY += 4.2 + 2
    drawLegalParagraph(generales.line1, 'semibold', C.body)
    drawLegalParagraph(generales.line2, 'regular', C.secondary)
    cursorY += 2.5
    drawLegalSubtitle('CANCELACIÓN')
    drawLegalParagraph(getCancelacionText(), 'regular', C.secondary)
    cursorY += 2.5
    drawLegalSubtitle('COSTOS')
    drawLegalParagraph(getCostosText(), 'regular', C.secondary)
  }

  pages.forEach((rows, pi) => {
    let top: number
    if (pi === 0) {
      drawFirstHeader()
      top = firstTableY
    } else {
      doc.addPage()
      drawCompactHeader()
      top = CONT_CONTENT_Y
    }
    if (rows.length > 0 || pi === 0) {
      top = drawColumnHeader(top)
      rows.forEach((r) => {
        top = drawRow(r, top)
      })
    }
    cursorY = top
  })

  if (blockOnNewPage) {
    newPage()
  } else if (lastPage.length > 0) {
    cursorY += TABLE_TO_TOTALS
  }
  ensure(totalsBandH)
  drawTotalsBand(cursorY)
  cursorY += totalsBandH
  drawNotes()
  drawGenerales()

  // ── Pie en todas las páginas ──
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    hline(doc, 283, TEXT_L, TEXT_R, 0.2, C.hairline)
    fonts.set(doc, 'regular', 6.5)
    doc.setTextColor(...C.tertiary)
    const by = baseline(283 + 2.2, 3)
    doc.text(`Serenata House Entertainment · Cotización ${data.id}`, TEXT_L, by)
    doc.text(`Página ${i} de ${total}`, TEXT_R, by, { align: 'right' })
  }

  return doc.output('arraybuffer') as ArrayBuffer
}

export type { CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf-types'
