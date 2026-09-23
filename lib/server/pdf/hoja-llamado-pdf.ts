/**
 * Server-side "Hoja de Llamado" PDF Generator
 *
 * Diseño: "Hoja de llamado PDF.dc.html" (Claude Design, misma familia que
 * Cotización y Orden de pago, 2026-09-23). Coordenadas en mm, texto en pt.
 * Dibujo manual con jsPDF y los helpers compartidos de pdf-draw.ts.
 *
 * Paginación:
 * - Notas generales es un bloque indivisible (título + caja).
 * - Una sección de tabla empieza solo si caben título + encabezado de tabla +
 *   las 2 primeras filas; si no, pasa completa a la página siguiente.
 * - Una fila nunca se parte. Si no cabe: página nueva con encabezado compacto,
 *   título "(cont.)" y encabezado de tabla repetido.
 * - Equipo técnico agrupado por responsable; la primera fila de una página
 *   nueva repite el responsable.
 * - Pie "Página N de M" en todas las páginas.
 */

import { jsPDF } from 'jspdf'
import { getIsoLogoBase64, ISO_RATIO } from '@/lib/server/pdf/cotizacion-pdf-helpers'
import { formatDateDisplay } from '@/lib/format-date'
import {
  type FontKind,
  type RGB,
  centerBaseline,
  clampLines,
  ellipsize,
  hline,
  registerFonts,
  trackedText,
} from '@/lib/server/pdf/pdf-draw'

export interface HojaDeLlamadoData {
  proyecto: string
  cliente: string
  fecha_entrega: string | null
  locacion: string | null
  horarios: string | null
  punto_encuentro: string | null
  notas: string | null
  items: Array<{
    id: string
    descripcion: string
    categoria: string
    cantidad: number
    responsable_id: string | null
    responsable_nombre: string | null
    notas?: string | null
  }>
  responsables: Array<{
    id: string
    nombre: string
    telefono: string | null
  }>
}

// Paleta del diseño (solo estos colores)
const C = {
  ink: [29, 29, 31] as RGB, // #1D1D1F
  body: [58, 58, 60] as RGB, // #3A3A3C
  secondary: [110, 110, 115] as RGB, // #6E6E73
  structural: [210, 210, 215] as RGB, // #D2D2D7
  hairline: [229, 229, 234] as RGB, // #E5E5EA
  box: [245, 245, 247] as RGB, // #F5F5F7
  white: [255, 255, 255] as RGB,
}

// Retícula (mm)
const BAND_L = 10 // bandas y líneas: x 10 → 200
const BAND_R = 200
const BAND_W = BAND_R - BAND_L
const TEXT_L = 16 // texto: x 16 → 194
const TEXT_R = 194
const TEXT_W = TEXT_R - TEXT_L
const LIMIT = 277
const P1_START = 67.5
const PN_START = 28
const GAP = 7
const H_HEAD = 7
const H_TH = 7
const TRACK = 0.1 // charSpace de etiquetas en mayúsculas (mm)

const CREW_COLS = { name: 16, role: 56, phone: 93, hora: 119, notes: 146 }
const CREW_W = { name: 37, role: 34, phone: 23, hora: 24, notes: 48 }
const EQ_COLS = { desc: 16, qtyCenter: 97, resp: 108, notes: 150 }
const EQ_W = { desc: 74, resp: 38, notes: 44 }

const SIN_ASIGNAR = 'Sin asignar'
const POR_DEFINIR = 'Por definir'

/**
 * Horas "H:MM" en 24 h → 12 h con am/pm ("9:00–19:00" → "9:00 am–7:00 pm").
 * Las que ya traen am/pm se dejan igual.
 */
export function toTwelveHour(text: string): string {
  return text.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:[ap]\.?\s?m\.?)(?![a-z]))/gi, (_m, h: string, mm: string) => {
    const hour = Number(h)
    return `${hour % 12 || 12}:${mm} ${hour < 12 ? 'am' : 'pm'}`
  })
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

type CrewRow = {
  kind: 'crewRow'
  name: string
  unassigned: boolean
  role: string[]
  phone: string
  notes: string[]
  h: number
}
type EqRow = {
  kind: 'eqRow'
  desc: string[]
  qty: string
  resp: string
  respFull: string
  unassigned: boolean
  notes: string[]
  lastOfGroup: boolean
  h: number
}
type Block =
  | { kind: 'head'; title: string; count: string; h: number }
  | { kind: 'box'; lines: string[]; muted: boolean; h: number }
  | { kind: 'crewTh'; h: number }
  | { kind: 'eqTh'; h: number }
  | CrewRow
  | EqRow

export function generateHojaDeLlamadoPdf(data: HojaDeLlamadoData): ArrayBuffer {
  const doc = new jsPDF('p', 'mm', 'a4')
  const fonts = registerFonts(doc)
  const f = (kind: FontKind, size: number) => fonts.set(doc, kind, size)
  const isoLogoPng = getIsoLogoBase64()

  const getPhone = (responsableId: string | null): string => {
    if (!responsableId) return ''
    return data.responsables.find((r) => r.id === responsableId)?.telefono || ''
  }
  const fecha = data.fecha_entrega ? formatDateDisplay(data.fecha_entrega) : POR_DEFINIR

  // ── Medición y paginación ──
  const pages: Block[][] = [[]]
  let y = P1_START
  let pageStart = P1_START
  const page = () => pages[pages.length - 1]
  const newPage = () => {
    pages.push([])
    y = pageStart = PN_START
  }
  const push = (b: Block) => {
    page().push(b)
    y += b.h
  }
  const gap = () => {
    if (y !== pageStart) y += GAP
  }
  const head = (title: string, count: string) => push({ kind: 'head', title, count, h: H_HEAD })

  const notas = (data.notas || '').trim()
  if (notas) {
    f('regular', 9)
    const lines = clampLines(doc, notas, TEXT_W, 8)
    const h = 8 + lines.length * 4.4
    gap()
    if (y + H_HEAD + h > LIMIT && page().length) newPage()
    head('Notas generales', '')
    push({ kind: 'box', lines, muted: false, h })
  }

  const table = (title: string, count: string, rows: Array<CrewRow | EqRow>, th: Block, emptyText?: string) => {
    gap()
    if (!rows.length) {
      if (!emptyText) return
      if (y + H_HEAD + 12 > LIMIT && page().length) newPage()
      head(title, count)
      push({ kind: 'box', lines: [emptyText], muted: true, h: 12 })
      return
    }
    const min = rows.slice(0, 2).reduce((s, r) => s + r.h, 0)
    if (y + H_HEAD + H_TH + min > LIMIT && page().length) newPage()
    head(title, count)
    push(th)
    rows.forEach((r) => {
      if (y + r.h > LIMIT) {
        newPage()
        head(`${title} (cont.)`, '')
        push(th)
        if (r.kind === 'eqRow') r = { ...r, resp: r.respFull }
      }
      push(r)
    })
  }

  const crewItems = data.items.filter((i) => i.categoria?.toLowerCase() === 'crew')
  const crew: CrewRow[] = crewItems.map((item) => {
    const unassigned = !item.responsable_nombre
    f('regular', 8)
    const notes = clampLines(doc, item.notas || '', CREW_W.notes, 2)
    f('regular', 8.5)
    const role = clampLines(doc, item.descripcion || '', CREW_W.role, 2)
    const phone = ellipsize(doc, getPhone(item.responsable_id), CREW_W.phone)
    f(unassigned ? 'regular' : 'semibold', 8.5)
    const name = unassigned ? SIN_ASIGNAR : ellipsize(doc, item.responsable_nombre || '', CREW_W.name)
    return { kind: 'crewRow', name, unassigned, role, phone, notes, h: notes.length > 1 || role.length > 1 ? 12.5 : 9 }
  })
  table('Crew', crew.length ? plural(crew.length, 'persona', 'personas') : '', crew, { kind: 'crewTh', h: H_TH }, 'Sin crew asignado')

  const eqItems = data.items.filter((i) => i.categoria?.toLowerCase() !== 'crew')
  if (eqItems.length) {
    const respOf = (i: (typeof eqItems)[number]) => i.responsable_nombre || SIN_ASIGNAR
    const order: string[] = []
    eqItems.forEach((i) => {
      if (!order.includes(respOf(i))) order.push(respOf(i))
    })
    const sorted = order.flatMap((r) => eqItems.filter((i) => respOf(i) === r))
    const eq: EqRow[] = sorted.map((item, idx) => {
      const r = respOf(item)
      const first = idx === 0 || respOf(sorted[idx - 1]) !== r
      const last = idx === sorted.length - 1 || respOf(sorted[idx + 1]) !== r
      f('semibold', 8.5)
      const desc = clampLines(doc, item.descripcion || '', EQ_W.desc, 2)
      f('regular', 8)
      const notes = clampLines(doc, item.notas || '', EQ_W.notes, 2)
      f('regular', 8.5)
      const respFull = ellipsize(doc, r, EQ_W.resp)
      return {
        kind: 'eqRow',
        desc,
        qty: String(item.cantidad),
        resp: first ? respFull : '',
        respFull,
        unassigned: !item.responsable_nombre,
        notes,
        lastOfGroup: last,
        h: desc.length > 1 || notes.length > 1 ? 11.5 : 8,
      }
    })
    table('Equipo técnico', plural(eq.length, 'elemento', 'elementos'), eq, { kind: 'eqTh', h: H_TH })
  }

  // ── Dibujo ──
  const label = (text: string, x: number, cy: number, color: RGB, align: 'left' | 'center' = 'left') => {
    f('bold', 6.5)
    doc.setTextColor(...color)
    trackedText(doc, text, x, centerBaseline(cy, 6.5), TRACK, align)
  }

  /** Líneas centradas verticalmente en `cy` con interlínea `lh`. */
  const linesAt = (lines: string[], x: number, cy: number, size: number, lh: number) => {
    const first = cy - ((lines.length - 1) * lh) / 2
    lines.forEach((l, i) => doc.text(l, x, centerBaseline(first + i * lh, size)))
  }

  const drawFirstHeader = () => {
    f('bold', 14)
    doc.setTextColor(...C.ink)
    doc.text('Hoja de llamado', TEXT_L, centerBaseline(13 + 2.6, 14))
    f('regular', 9.5)
    doc.setTextColor(...C.body)
    doc.text(ellipsize(doc, data.proyecto || '', 165), TEXT_L, centerBaseline(18.6 + 2, 9.5))
    if (isoLogoPng) {
      try {
        doc.addImage(isoLogoPng, 'PNG', 185, 13.3, 9, 9 / ISO_RATIO)
      } catch (e) {
        console.warn('[hoja-llamado] Error añadiendo logo ISO:', e)
      }
    }
    hline(doc, 25.5, BAND_L, BAND_R, 0.2, C.structural)

    label('FECHA', TEXT_L, 29.5 + 1.3, C.secondary)
    label('HORARIOS', 104, 29.5 + 1.3, C.secondary)
    label('LOCACIÓN', TEXT_L, 45.5 + 1.3, C.secondary)
    label('PUNTO DE ENCUENTRO', 104, 45.5 + 1.3, C.secondary)

    f('bold', 13)
    doc.setTextColor(...C.ink)
    doc.text(fecha, TEXT_L, centerBaseline(33 + 2.6, 13))

    const value = (text: string | null, x: number, top: number, width: number, split: 'wrap' | 'dot') => {
      const v = (text || '').trim()
      if (!v) {
        f('regular', 10)
        doc.setTextColor(...C.secondary)
        doc.text(POR_DEFINIR, x, centerBaseline(top + 2.15, 10))
        return
      }
      f('semibold', 10)
      doc.setTextColor(...C.ink)
      const lines =
        split === 'dot'
          ? toTwelveHour(v)
              .split(/\s*·\s*/)
              .filter(Boolean)
              .slice(0, 2)
              .map((l) => ellipsize(doc, l, width))
          : clampLines(doc, v, width, 2)
      lines.forEach((l, i) => doc.text(l, x, centerBaseline(top + 2.15 + i * 4.3, 10)))
    }
    value(data.horarios, 104, 33.2, 90, 'dot')
    value(data.locacion, TEXT_L, 49.2, 84, 'wrap')
    value(data.punto_encuentro, 104, 49.2, 90, 'wrap')
    hline(doc, 61.5, BAND_L, BAND_R, 0.2, C.structural)
  }

  const drawCompactHeader = () => {
    f('bold', 9)
    doc.setTextColor(...C.ink)
    doc.text('Hoja de llamado', TEXT_L, centerBaseline(13.2 + 1.8, 9))
    doc.text(fecha, 184, centerBaseline(14.2 + 1.8, 9), { align: 'right' })
    f('regular', 8)
    doc.setTextColor(...C.secondary)
    doc.text(ellipsize(doc, data.proyecto || '', 150), TEXT_L, centerBaseline(16.6 + 1.7, 8))
    if (isoLogoPng) {
      try {
        doc.addImage(isoLogoPng, 'PNG', 188, 13, 6, 6 / ISO_RATIO)
      } catch (e) {
        console.warn('[hoja-llamado] Error añadiendo logo ISO:', e)
      }
    }
    hline(doc, 22, BAND_L, BAND_R, 0.2, C.structural)
  }

  const drawBlock = (b: Block, top: number) => {
    switch (b.kind) {
      case 'head': {
        f('bold', 10)
        doc.setTextColor(...C.ink)
        doc.text(b.title, TEXT_L, centerBaseline(top + 2, 10))
        if (b.count) {
          f('regular', 7.5)
          doc.setTextColor(...C.secondary)
          doc.text(b.count, TEXT_R, centerBaseline(top + 2, 7.5), { align: 'right' })
        }
        break
      }
      case 'box': {
        doc.setFillColor(...C.box)
        doc.roundedRect(BAND_L, top, BAND_W, b.h, 2, 2, 'F')
        f('regular', 9)
        doc.setTextColor(...(b.muted ? C.secondary : C.body))
        linesAt(b.lines, TEXT_L, top + b.h / 2, 9, 4.4)
        break
      }
      case 'crewTh':
      case 'eqTh': {
        doc.setFillColor(...C.ink)
        doc.roundedRect(BAND_L, top, BAND_W, H_TH, 1.5, 1.5, 'F')
        const cy = top + H_TH / 2
        if (b.kind === 'crewTh') {
          label('NOMBRE', CREW_COLS.name, cy, C.white)
          label('ROL', CREW_COLS.role, cy, C.white)
          label('TELÉFONO', CREW_COLS.phone, cy, C.white)
          label('HORA DE LLAMADO', CREW_COLS.hora, cy, C.white)
          label('NOTAS', CREW_COLS.notes, cy, C.white)
        } else {
          label('DESCRIPCIÓN', EQ_COLS.desc, cy, C.white)
          label('CANT.', EQ_COLS.qtyCenter, cy, C.white, 'center')
          label('RESPONSABLE', EQ_COLS.resp, cy, C.white)
          label('NOTAS', EQ_COLS.notes, cy, C.white)
        }
        break
      }
      case 'crewRow': {
        const cy = top + b.h / 2
        f(b.unassigned ? 'regular' : 'semibold', 8.5)
        doc.setTextColor(...(b.unassigned ? C.secondary : C.ink))
        doc.text(b.name, CREW_COLS.name, centerBaseline(cy, 8.5))
        f('regular', 8.5)
        doc.setTextColor(...C.body)
        linesAt(b.role, CREW_COLS.role, cy, 8.5, 3.8)
        if (b.phone) doc.text(b.phone, CREW_COLS.phone, centerBaseline(cy, 8.5))
        f('regular', 8)
        doc.setTextColor(...C.secondary)
        linesAt(b.notes, CREW_COLS.notes, cy, 8, 3.8)
        hline(doc, top + b.h - 0.1, BAND_L, BAND_R, 0.2, C.hairline)
        break
      }
      case 'eqRow': {
        const cy = top + b.h / 2
        f('semibold', 8.5)
        doc.setTextColor(...C.ink)
        linesAt(b.desc, EQ_COLS.desc, cy, 8.5, 3.8)
        doc.text(b.qty, EQ_COLS.qtyCenter, centerBaseline(cy, 8.5), { align: 'center' })
        if (b.resp) {
          f('regular', 8.5)
          doc.setTextColor(...(b.unassigned ? C.secondary : C.body))
          doc.text(b.resp, EQ_COLS.resp, centerBaseline(cy, 8.5))
        }
        f('regular', 8)
        doc.setTextColor(...C.secondary)
        linesAt(b.notes, EQ_COLS.notes, cy, 8, 3.8)
        if (b.lastOfGroup) hline(doc, top + b.h - 0.2, BAND_L, BAND_R, 0.4, C.structural)
        else hline(doc, top + b.h - 0.1, TEXT_L, BAND_R, 0.2, C.hairline)
        break
      }
    }
  }

  pages.forEach((blocks, pi) => {
    if (pi > 0) doc.addPage()
    if (pi === 0) drawFirstHeader()
    else drawCompactHeader()
    let top = pi === 0 ? P1_START : PN_START
    let prevWasContent = false
    blocks.forEach((b) => {
      // La separación entre secciones se aplica antes de cada título que no
      // abre la página (misma regla que en la medición).
      if (b.kind === 'head' && prevWasContent) top += GAP
      drawBlock(b, top)
      top += b.h
      prevWasContent = true
    })
  })

  // ── Pie en todas las páginas ──
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    hline(doc, 283.5, BAND_L, BAND_R, 0.2, C.hairline)
    f('regular', 7)
    doc.setTextColor(...C.secondary)
    doc.text(`Serenata House Entertainment · Hoja de llamado · Página ${i} de ${total}`, TEXT_L, centerBaseline(285.6 + 1.4, 7))
  }

  return doc.output('arraybuffer') as ArrayBuffer
}
