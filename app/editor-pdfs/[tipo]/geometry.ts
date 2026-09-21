import type { PdfElement } from '@/lib/server/pdf/pdf-template-schema'

/** px por mm en el canvas del editor (A4 a 210mm × 297mm ⇒ 630×891px). */
export const CANVAS_SCALE = 3

export function mmToPx(mm: number): number {
  return mm * CANVAS_SCALE
}

export function pxToMm(px: number): number {
  return px / CANVAS_SCALE
}

/** Redondea al múltiplo de `grid` (mm) más cercano. */
export function snapToGrid(value: number, grid: number): number {
  if (grid <= 0) return value
  return Math.round(value / grid) * grid
}

export interface BoundingBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function boundingBoxOf(elements: PdfElement[]): BoundingBox | null {
  if (elements.length === 0) return null
  return elements.reduce<BoundingBox>(
    (box, el) => ({
      minX: Math.min(box.minX, el.x),
      minY: Math.min(box.minY, el.y),
      maxX: Math.max(box.maxX, el.x + el.w),
      maxY: Math.max(box.maxY, el.y + (el.h ?? 0)),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  )
}

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'

/**
 * Alinea `elements` entre sí usando su propio bounding box conjunto como
 * referencia (no la página) -- mismo criterio que la mayoría de editores
 * visuales: alinear 1 elemento contra el resto del grupo seleccionado.
 */
export function align(elements: PdfElement[], mode: AlignMode): PdfElement[] {
  const box = boundingBoxOf(elements)
  if (!box) return elements

  return elements.map(el => {
    switch (mode) {
      case 'left':
        return { ...el, x: box.minX }
      case 'right':
        return { ...el, x: box.maxX - el.w }
      case 'center-h':
        return { ...el, x: (box.minX + box.maxX) / 2 - el.w / 2 }
      case 'top':
        return { ...el, y: box.minY }
      case 'bottom':
        return { ...el, y: box.maxY - (el.h ?? 0) }
      case 'center-v':
        return { ...el, y: (box.minY + box.maxY) / 2 - (el.h ?? 0) / 2 }
      default:
        return el
    }
  })
}

/** Distribuye espaciado uniforme entre los elementos (por su centro), en el orden que ya traen. Requiere 3+. */
export function distributeHorizontal(elements: PdfElement[]): PdfElement[] {
  if (elements.length < 3) return elements
  const sorted = [...elements].sort((a, b) => a.x - b.x)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const totalWidth = sorted.reduce((sum, el) => sum + el.w, 0)
  const span = last.x + last.w - first.x
  const gap = (span - totalWidth) / (sorted.length - 1)

  let cursor = first.x
  const positioned = sorted.map(el => {
    const updated = { ...el, x: cursor }
    cursor += el.w + gap
    return updated
  })

  return elements.map(el => positioned.find(p => p.id === el.id) ?? el)
}

export function distributeVertical(elements: PdfElement[]): PdfElement[] {
  if (elements.length < 3) return elements
  const withH = elements.filter(el => el.h !== undefined)
  if (withH.length < 3) return elements
  const sorted = [...withH].sort((a, b) => a.y - b.y)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const totalHeight = sorted.reduce((sum, el) => sum + (el.h ?? 0), 0)
  const span = last.y + (last.h ?? 0) - first.y
  const gap = (span - totalHeight) / (sorted.length - 1)

  let cursor = first.y
  const positioned = sorted.map(el => {
    const updated = { ...el, y: cursor }
    cursor += (el.h ?? 0) + gap
    return updated
  })

  return elements.map(el => positioned.find(p => p.id === el.id) ?? el)
}
