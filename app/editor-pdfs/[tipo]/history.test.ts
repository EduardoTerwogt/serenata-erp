// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { useEditorHistory } from './history'

function template(elements: PdfTemplate['elements'] = []): PdfTemplate {
  return { tipoDocumento: 'cotizacion', page: { width: 210, height: 297, margins: { top: 20, right: 15, bottom: 20, left: 15 } }, elements }
}

const textEl = (id: string, text: string) =>
  ({ id, type: 'text' as const, x: 0, y: 0, w: 10, text, size: 10, bold: false, align: 'left' as const, colorToken: 'ink' })

describe('useEditorHistory', () => {
  it('reset() no genera entrada de historial (canUndo sigue false)', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => result.current.reset(template([textEl('a', 'uno')])))
    expect(result.current.present?.elements[0]).toMatchObject({ text: 'uno' })
    expect(result.current.canUndo).toBe(false)
  })

  it('commit() acumula historial; undo/redo navegan entre versiones', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => result.current.reset(template([textEl('a', 'v0')])))
    act(() => result.current.commit(template([textEl('a', 'v1')])))
    act(() => result.current.commit(template([textEl('a', 'v2')])))

    expect(result.current.present?.elements[0]).toMatchObject({ text: 'v2' })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)

    act(() => result.current.undo())
    expect(result.current.present?.elements[0]).toMatchObject({ text: 'v1' })
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.present?.elements[0]).toMatchObject({ text: 'v0' })
    expect(result.current.canUndo).toBe(false)

    act(() => result.current.redo())
    act(() => result.current.redo())
    expect(result.current.present?.elements[0]).toMatchObject({ text: 'v2' })
    expect(result.current.canRedo).toBe(false)
  })

  it('un commit nuevo después de un undo descarta el future (rama alternativa)', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => result.current.reset(template([textEl('a', 'v0')])))
    act(() => result.current.commit(template([textEl('a', 'v1')])))
    act(() => result.current.undo())
    act(() => result.current.commit(template([textEl('a', 'rama-nueva')])))

    expect(result.current.present?.elements[0]).toMatchObject({ text: 'rama-nueva' })
    expect(result.current.canRedo).toBe(false)
  })

  it('undo/redo sin historial no truena y no llama onChange', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useEditorHistory(onChange))
    act(() => result.current.reset(template()))
    act(() => result.current.undo())
    act(() => result.current.redo())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('onChange se dispara con commit/undo/redo pero nunca con reset', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() => useEditorHistory(onChange))

    act(() => result.current.reset(template([textEl('a', 'v0')])))
    expect(onChange).not.toHaveBeenCalled()

    act(() => result.current.commit(template([textEl('a', 'v1')])))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ elements: [expect.objectContaining({ text: 'v1' })] }))

    act(() => result.current.undo())
    expect(onChange).toHaveBeenCalledTimes(2)

    act(() => result.current.redo())
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('respeta el tope de 50 entradas de historial', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => result.current.reset(template([textEl('a', 'v0')])))
    for (let i = 1; i <= 60; i++) {
      act(() => result.current.commit(template([textEl('a', `v${i}`)])))
    }
    let undoCount = 0
    while (result.current.canUndo) {
      act(() => result.current.undo())
      undoCount++
    }
    expect(undoCount).toBe(50)
    expect(result.current.present?.elements[0]).toMatchObject({ text: 'v10' }) // v0..v9 se descartaron por el tope
  })
})
