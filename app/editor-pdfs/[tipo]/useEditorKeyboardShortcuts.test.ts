// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfElement } from '@/lib/server/pdf/pdf-template-schema'
import { useEditorKeyboardShortcuts } from './useEditorKeyboardShortcuts'
import type { EditorSelection } from './selection'

const textEl = (id: string, extra: Partial<PdfElement> = {}): PdfElement =>
  ({ id, type: 'text', x: 10, y: 10, w: 20, text: 't', size: 10, bold: false, align: 'left', colorToken: 'ink', ...extra } as PdfElement)

function setup(args: { selection: EditorSelection; elements: PdfElement[] }) {
  const onSelect = vi.fn()
  const onChangeElements = vi.fn()
  const onUndo = vi.fn()
  const onRedo = vi.fn()
  renderHook(() =>
    useEditorKeyboardShortcuts({ selection: args.selection, elements: args.elements, onSelect, onChangeElements, onUndo, onRedo })
  )
  return { onSelect, onChangeElements, onUndo, onRedo }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useEditorKeyboardShortcuts', () => {
  it('Ctrl/Cmd+Z llama undo; Ctrl/Cmd+Shift+Z y Ctrl+Y llaman redo', () => {
    const { onUndo, onRedo } = setup({ selection: { type: 'none' }, elements: [] })

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(onRedo).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(onRedo).toHaveBeenCalledTimes(2)
  })

  it('Cmd/Ctrl+A selecciona todos los elementos no-sticky', () => {
    const elements = [textEl('a'), textEl('b'), textEl('c', { sticky: 'header' })]
    const { onSelect } = setup({ selection: { type: 'none' }, elements })

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(onSelect).toHaveBeenCalledWith(['a', 'b'])
  })

  it('Delete borra los elementos seleccionados que no sean required y deselecciona', () => {
    const elements = [textEl('a'), textEl('b', { required: true })]
    const { onChangeElements, onSelect } = setup({ selection: { type: 'multiple', elementIds: ['a', 'b'] }, elements })

    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onChangeElements).toHaveBeenCalledTimes(1)
    const updater = onChangeElements.mock.calls[0][0] as (els: PdfElement[]) => PdfElement[]
    const result = updater(elements)
    expect(result.map(e => e.id)).toEqual(['b']) // solo sobrevive el required
    expect(onSelect).toHaveBeenCalledWith([])
  })

  it('Escape con selección deselecciona; sin selección no llama onSelect', () => {
    const elements = [textEl('a')]
    const { onSelect } = setup({ selection: { type: 'single', elementId: 'a' }, elements })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onSelect).toHaveBeenCalledWith([])

    const { onSelect: onSelect2 } = setup({ selection: { type: 'none' }, elements })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onSelect2).not.toHaveBeenCalled()
  })

  it('flechas mueven 1mm, Shift+flecha 5mm, un solo commit por tecla', () => {
    const elements = [textEl('a')]
    const { onChangeElements } = setup({ selection: { type: 'single', elementId: 'a' }, elements })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onChangeElements).toHaveBeenCalledTimes(1)
    let updater = onChangeElements.mock.calls[0][0] as (els: PdfElement[]) => PdfElement[]
    expect((updater(elements)[0] as { x: number }).x).toBe(11)

    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
    expect(onChangeElements).toHaveBeenCalledTimes(2)
    updater = onChangeElements.mock.calls[1][0] as (els: PdfElement[]) => PdfElement[]
    expect((updater(elements)[0] as { y: number }).y).toBe(15)
  })

  it('auto-repeat del SO en una flecha (e.repeat) no genera commits adicionales', () => {
    const elements = [textEl('a')]
    const { onChangeElements } = setup({ selection: { type: 'single', elementId: 'a' }, elements })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })
    expect(onChangeElements).toHaveBeenCalledTimes(1)
  })

  it('flowAfter bloquea el nudge vertical (y no cambia)', () => {
    const elements = [textEl('a', { flowAfter: 'otro' })]
    const { onChangeElements } = setup({ selection: { type: 'single', elementId: 'a' }, elements })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    const updater = onChangeElements.mock.calls[0][0] as (els: PdfElement[]) => PdfElement[]
    expect((updater(elements)[0] as { y: number }).y).toBe(10) // sin cambio
  })

  it('guarda de foco: Delete/Cmd+A/flechas/Escape se ignoran con foco en un input, pero Ctrl+Z sigue activo', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const elements = [textEl('a')]
    const { onChangeElements, onSelect, onUndo } = setup({ selection: { type: 'single', elementId: 'a' }, elements })

    fireEvent.keyDown(input, { key: 'Delete' })
    fireEvent.keyDown(input, { key: 'a', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'ArrowRight' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onChangeElements).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})
