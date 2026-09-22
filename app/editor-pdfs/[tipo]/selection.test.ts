import { describe, expect, it } from 'vitest'
import { resolveToolbarContext, selectionFromIds, selectionIds } from './selection'
import type { PdfElement } from '@/lib/server/pdf/pdf-template-schema'

function textEl(id: string): PdfElement {
  return { id, type: 'text', x: 0, y: 0, w: 10, text: 't', size: 10, bold: false, align: 'left', colorToken: 'ink' }
}
function lineEl(id: string): PdfElement {
  return { id, type: 'line', x: 0, y: 0, w: 10, colorToken: 'ink', weight: 0.5 }
}

describe('selectionFromIds / selectionIds', () => {
  it('mapea [] -> none, [1] -> single, [1,2] -> multiple, y de vuelta', () => {
    expect(selectionFromIds([])).toEqual({ type: 'none' })
    expect(selectionFromIds(['a'])).toEqual({ type: 'single', elementId: 'a' })
    expect(selectionFromIds(['a', 'b'])).toEqual({ type: 'multiple', elementIds: ['a', 'b'] })

    expect(selectionIds({ type: 'none' })).toEqual([])
    expect(selectionIds({ type: 'single', elementId: 'a' })).toEqual(['a'])
    expect(selectionIds({ type: 'multiple', elementIds: ['a', 'b'] })).toEqual(['a', 'b'])
  })
})

describe('resolveToolbarContext', () => {
  const elements = [textEl('t1'), lineEl('l1')]

  it('none -> empty', () => {
    expect(resolveToolbarContext({ type: 'none' }, elements)).toEqual({ kind: 'empty' })
  })

  it('single -> angosta por tipo real del elemento', () => {
    const ctx = resolveToolbarContext({ type: 'single', elementId: 't1' }, elements)
    expect(ctx.kind).toBe('text')
    if (ctx.kind === 'text') expect(ctx.element.id).toBe('t1')
  })

  it('single con id obsoleto (ya borrado) colapsa a empty, no truena', () => {
    expect(resolveToolbarContext({ type: 'single', elementId: 'no-existe' }, elements)).toEqual({ kind: 'empty' })
  })

  it('multiple con 2+ elementos resueltos -> kind multiple', () => {
    const ctx = resolveToolbarContext({ type: 'multiple', elementIds: ['t1', 'l1'] }, elements)
    expect(ctx.kind).toBe('multiple')
    if (ctx.kind === 'multiple') expect(ctx.elements).toHaveLength(2)
  })

  it('multiple donde solo 1 id sigue existiendo colapsa al tipo de ese elemento', () => {
    const ctx = resolveToolbarContext({ type: 'multiple', elementIds: ['t1', 'ya-no-existe'] }, elements)
    expect(ctx.kind).toBe('text')
  })

  it('multiple donde ningún id existe colapsa a empty', () => {
    expect(resolveToolbarContext({ type: 'multiple', elementIds: ['x', 'y'] }, elements)).toEqual({ kind: 'empty' })
  })
})
