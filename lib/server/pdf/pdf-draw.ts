/**
 * Helpers de dibujo compartidos por los PDFs rediseñados en Claude Design
 * (docs/PLAN.md, docs/decisions/015-pdfs-disenados-en-claude-design.md).
 * Unidades: mm para posiciones, pt para tamaños de texto.
 */

import { jsPDF } from 'jspdf'
import { INTER_BOLD_BASE64, INTER_REGULAR_BASE64, INTER_SEMIBOLD_BASE64 } from '@/lib/server/pdf/fonts/inter'

export type RGB = [number, number, number]

export const PT = 25.4 / 72 // mm por pt

export type FontKind = 'regular' | 'semibold' | 'bold'

export interface Fonts {
  set(doc: jsPDF, kind: FontKind, size: number): void
}

/** Registra Inter (Regular/SemiBold/Bold); si falla, cae a Helvetica con aviso. */
export function registerFonts(doc: jsPDF): Fonts {
  try {
    doc.addFileToVFS('Inter-Regular.ttf', INTER_REGULAR_BASE64)
    doc.addFont('Inter-Regular.ttf', 'Inter', 'normal')
    doc.addFileToVFS('Inter-SemiBold.ttf', INTER_SEMIBOLD_BASE64)
    doc.addFont('Inter-SemiBold.ttf', 'InterSemiBold', 'normal')
    doc.addFileToVFS('Inter-Bold.ttf', INTER_BOLD_BASE64)
    doc.addFont('Inter-Bold.ttf', 'Inter', 'bold')
    return {
      set(d, kind, size) {
        if (kind === 'semibold') d.setFont('InterSemiBold', 'normal')
        else d.setFont('Inter', kind === 'bold' ? 'bold' : 'normal')
        d.setFontSize(size)
      },
    }
  } catch (e) {
    console.warn('Error registrando Inter en PDF, se usa Helvetica:', e)
    return {
      set(d, kind, size) {
        d.setFont('helvetica', kind === 'regular' ? 'normal' : 'bold')
        d.setFontSize(size)
      },
    }
  }
}

/** Línea base aproximada de la primera línea en una caja de interlínea `lh`. */
export const baseline = (top: number, lh: number) => top + 0.72 * lh

/**
 * Línea base de un texto Inter de `sizePt` centrado verticalmente en `centerY`
 * (equivale a CSS line-height centrado: ascender 0.969em, descender 0.242em).
 */
export const centerBaseline = (centerY: number, sizePt: number) => centerY + 0.3635 * sizePt * PT

export function hline(doc: jsPDF, y: number, x1: number, x2: number, w: number, color: RGB) {
  doc.setDrawColor(...color)
  doc.setLineWidth(w)
  doc.line(x1, y, x2, y)
}

/** Texto justificado palabra por palabra (Tw no aplica a fuentes Identity-H). */
export function drawJustified(doc: jsPDF, text: string, x: number, y: number, width: number, lh: number): number {
  const paragraphs = text.split('\n')
  paragraphs.forEach((para) => {
    const lines: string[] = doc.splitTextToSize(para, width)
    lines.forEach((line, i) => {
      const words = line.trim().split(/\s+/)
      const isLast = i === lines.length - 1
      if (isLast || words.length < 2) {
        doc.text(line.trim(), x, y)
      } else {
        const wordsW = words.reduce((s, w) => s + doc.getTextWidth(w), 0)
        const gap = (width - wordsW) / (words.length - 1)
        let cx = x
        words.forEach((w) => {
          doc.text(w, cx, y)
          cx += doc.getTextWidth(w) + gap
        })
      }
      y += lh
    })
  })
  return y
}

export function countLines(doc: jsPDF, text: string, width: number): number {
  return text.split('\n').reduce((n, p) => n + (doc.splitTextToSize(p, width) as string[]).length, 0)
}

/** splitTextToSize respetando saltos de línea explícitos. */
export function wrapLines(doc: jsPDF, text: string, width: number): string[] {
  return text.split('\n').flatMap((p) => doc.splitTextToSize(p, width) as string[])
}

/** Ancho visible de un texto con tracking (charSpace entre caracteres). */
export function trackedWidth(doc: jsPDF, text: string, cs: number) {
  return doc.getTextWidth(text) + (text.length - 1) * cs
}

/**
 * Texto en mayúsculas con tracking. jsPDF no incluye charSpace al alinear a la
 * derecha/centro, así que se calcula la x izquierda con el ancho visible real.
 */
export function trackedText(doc: jsPDF, text: string, x: number, y: number, cs: number, align: 'left' | 'center' | 'right' = 'left') {
  const w = trackedWidth(doc, text, cs)
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
  doc.text(text, left, y, { charSpace: cs })
  return w
}

/** Recorta con "…" para que quepa en `width`. */
export function ellipsize(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(t + '…') > width) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}
