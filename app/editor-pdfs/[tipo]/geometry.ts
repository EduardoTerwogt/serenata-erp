import type { PdfElement, PdfPage } from '@/lib/server/pdf/pdf-template-schema'

/** px por mm en el canvas del editor (A4 a 210mm × 297mm ⇒ 630×891px). */
export const CANVAS_SCALE = 3

export function mmToPx(mm: number): number {
  return mm * CANVAS_SCALE
}

export function pxToMm(px: number): number {
  return px / CANVAS_SCALE
}

/**
 * Zoom/viewport mínimo viable (Bloque 11.4, docs/PLAN.md): mismas
 * conversiones que `mmToPx`/`pxToMm`, con un factor de escala extra
 * (`CANVAS_SCALE * zoom`) -- un solo lugar centraliza el efecto del zoom
 * para que drag/resize/marquee/tamaño de texto no se desincronicen del
 * lienzo. `zoom = 1` es idéntico a `mmToPx`/`pxToMm`.
 */
export function mmToPxZoomed(mm: number, zoom: number): number {
  return mm * CANVAS_SCALE * zoom
}

export function pxToMmZoomed(px: number, zoom: number): number {
  return px / (CANVAS_SCALE * zoom)
}

/** Niveles discretos de zoom (Bloque 11.4) -- rango mínimo viable, 50%-200%. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
export const ZOOM_MIN = ZOOM_STEPS[0]
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1]

/** Siguiente nivel de zoom hacia arriba/abajo desde `current` (no tiene que ser exactamente un valor de ZOOM_STEPS, ej. tras "Ajustar a página"). */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    const next = ZOOM_STEPS.find(z => z > current + 1e-6)
    return next ?? ZOOM_MAX
  }
  const reversed = [...ZOOM_STEPS].reverse()
  const next = reversed.find(z => z < current - 1e-6)
  return next ?? ZOOM_MIN
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

/** Etiqueta legible de una capa -- compartida entre LayersPanel (lista de capas) y EditorCanvas (etiqueta flotante sobre la selección). */
export function layerLabel(el: PdfElement): string {
  if (el.type === 'text') return el.text.trim() ? el.text.slice(0, 28) : '(texto vacío)'
  if (el.type === 'table') return `Tabla · ${el.rowsBinding}`
  if (el.type === 'image') return `Imagen · ${el.src}`
  if (el.type === 'line') return 'Línea'
  return `Banner de totales (${el.rows.length})`
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

/** Trae `id` al frente (zIndex máximo actual + 1) dentro de `elements`. */
export function bringToFront(elements: PdfElement[], id: string): PdfElement[] {
  const maxZ = Math.max(0, ...elements.map(el => el.zIndex ?? 0))
  return elements.map(el => (el.id === id ? { ...el, zIndex: maxZ + 1 } : el))
}

/** Manda `id` al fondo (zIndex mínimo actual - 1) dentro de `elements`. */
export function sendToBack(elements: PdfElement[], id: string): PdfElement[] {
  const minZ = Math.min(0, ...elements.map(el => el.zIndex ?? 0))
  return elements.map(el => (el.id === id ? { ...el, zIndex: minZ - 1 } : el))
}

/**
 * Alinea `elements` contra los márgenes de la página (no contra su propio
 * bbox como `align()`) -- útil para un solo elemento seleccionado, donde
 * alinear contra sí mismo no tiene sentido. Elementos con `flowAfter` no se
 * tocan en el eje Y (su `y` es derivada, moverla no tendría efecto visible
 * -- mismo criterio que el arrastre en EditorCanvas.tsx).
 */
export function alignToPage(elements: PdfElement[], mode: AlignMode, page: PdfPage): PdfElement[] {
  const contentLeft = page.margins.left
  const contentRight = page.width - page.margins.right
  const contentTop = page.margins.top
  const contentBottom = page.height - page.margins.bottom

  return elements.map(el => {
    switch (mode) {
      case 'left':
        return { ...el, x: contentLeft }
      case 'right':
        return { ...el, x: contentRight - el.w }
      case 'center-h':
        return { ...el, x: (contentLeft + contentRight) / 2 - el.w / 2 }
      case 'top':
        return el.flowAfter ? el : { ...el, y: contentTop }
      case 'bottom':
        return el.flowAfter ? el : { ...el, y: contentBottom - (el.h ?? 0) }
      case 'center-v':
        return el.flowAfter ? el : { ...el, y: (contentTop + contentBottom) / 2 - (el.h ?? 0) / 2 }
      default:
        return el
    }
  })
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
