import { describe, expect, it } from 'vitest'
import { align, boundingBoxOf, distributeHorizontal, distributeVertical, mmToPx, pxToMm, snapToGrid } from './geometry'
import type { PdfElement } from '@/lib/server/pdf/pdf-template-schema'

function line(id: string, x: number, y: number, w: number, h = 10): PdfElement {
  return { id, x, y, w, h, type: 'line', colorToken: 'ink', weight: 0.5 }
}

describe('geometry: mm/px', () => {
  it('convierte mm a px y de vuelta sin pérdida', () => {
    expect(mmToPx(10)).toBe(30)
    expect(pxToMm(30)).toBe(10)
  })
})

describe('geometry: snapToGrid', () => {
  it('redondea al múltiplo más cercano', () => {
    expect(snapToGrid(11, 5)).toBe(10)
    expect(snapToGrid(13, 5)).toBe(15)
    expect(snapToGrid(7, 2)).toBe(8)
  })

  it('no cambia el valor si grid es 0', () => {
    expect(snapToGrid(11.3, 0)).toBe(11.3)
  })
})

describe('geometry: boundingBoxOf', () => {
  it('devuelve null para lista vacía', () => {
    expect(boundingBoxOf([])).toBeNull()
  })

  it('calcula el bounding box de varios elementos', () => {
    const box = boundingBoxOf([line('a', 10, 10, 20, 5), line('b', 5, 30, 10, 10)])
    expect(box).toEqual({ minX: 5, minY: 10, maxX: 30, maxY: 40 })
  })
})

describe('geometry: align', () => {
  const elements = [line('a', 10, 10, 20, 10), line('b', 40, 50, 10, 20)]

  it('left alinea todos al minX del grupo', () => {
    const result = align(elements, 'left')
    expect(result.map(e => e.x)).toEqual([10, 10])
  })

  it('right alinea el borde derecho al maxX del grupo', () => {
    const result = align(elements, 'right')
    // maxX del grupo = max(10+20, 40+10) = 50
    expect(result.find(e => e.id === 'a')!.x).toBe(30) // 50 - 20
    expect(result.find(e => e.id === 'b')!.x).toBe(40) // 50 - 10
  })

  it('top alinea todos al minY del grupo', () => {
    const result = align(elements, 'top')
    expect(result.map(e => e.y)).toEqual([10, 10])
  })

  it('no rompe con lista vacía', () => {
    expect(align([], 'left')).toEqual([])
  })
})

describe('geometry: distributeHorizontal', () => {
  it('no distribuye con menos de 3 elementos', () => {
    const els = [line('a', 0, 0, 10), line('b', 50, 0, 10)]
    expect(distributeHorizontal(els)).toBe(els)
  })

  it('espacia 3 elementos uniformemente entre el primero y el último', () => {
    const els = [line('a', 0, 0, 10), line('b', 20, 0, 10), line('c', 100, 0, 10)]
    const result = distributeHorizontal(els)
    const byId = Object.fromEntries(result.map(e => [e.id, e.x]))
    // span = 110 - 0 = 110, totalWidth = 30, gap = 80/2 = 40
    expect(byId.a).toBe(0)
    expect(byId.b).toBe(50) // 0 + 10 + 40
    expect(byId.c).toBe(100)
  })
})

describe('geometry: distributeVertical', () => {
  it('espacia 3 elementos uniformemente por su alto', () => {
    const els = [line('a', 0, 0, 10, 10), line('b', 0, 20, 10, 10), line('c', 0, 100, 10, 10)]
    const result = distributeVertical(els)
    const byId = Object.fromEntries(result.map(e => [e.id, e.y]))
    expect(byId.a).toBe(0)
    expect(byId.c).toBe(100)
  })

  it('no distribuye si algún elemento no tiene h', () => {
    const els: PdfElement[] = [
      { id: 'a', x: 0, y: 0, w: 10, type: 'text', text: 't', size: 8, bold: false, align: 'left', colorToken: 'ink' },
      line('b', 0, 20, 10, 10),
      line('c', 0, 100, 10, 10),
    ]
    expect(distributeVertical(els)).toBe(els)
  })
})
