// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PdfElement, PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { EditorCanvas } from './EditorCanvas'

/**
 * Bloque 11.2 (docs/PLAN.md): manipulación directa transaccional -- un solo
 * commit (`onChangeElements`) por gesto de drag/resize, no uno por
 * `pointermove` como antes de este bloque. No a ojo: verificado con conteo
 * exacto de llamadas.
 */

function baseTemplate(elements: PdfElement[]): PdfTemplate {
  return {
    tipoDocumento: 'cotizacion',
    page: { width: 210, height: 297, margins: { top: 20, right: 15, bottom: 20, left: 15 } },
    elements,
  }
}

function textEl(id: string): PdfElement {
  return { id, type: 'text', x: 20, y: 20, w: 60, h: 10, text: 'Hola', size: 10, bold: false, align: 'left', colorToken: 'ink' }
}

describe('EditorCanvas -- drag transaccional', () => {
  it('mover un elemento llama onChangeElements exactamente una vez, al soltar', () => {
    const template = baseTemplate([textEl('t1')])
    const onChangeElements = vi.fn()
    const onSelect = vi.fn()

    render(<EditorCanvas template={template} selectedIds={['t1']} onSelect={onSelect} onChangeElements={onChangeElements} snapGrid={0} />)

    const el = screen.getByTestId('el-t1')
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 })
    expect(onChangeElements).not.toHaveBeenCalled()

    fireEvent.pointerMove(window, { clientX: 110, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 130, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 105 })
    expect(onChangeElements).not.toHaveBeenCalled()

    fireEvent.pointerUp(window, { clientX: 150, clientY: 105 })
    expect(onChangeElements).toHaveBeenCalledTimes(1)
  })

  it('redimensionar (resize-se) llama onChangeElements exactamente una vez y mueve el elemento correcto', () => {
    const template = baseTemplate([textEl('t1')])
    const onChangeElements = vi.fn()
    const onSelect = vi.fn()

    render(<EditorCanvas template={template} selectedIds={['t1']} onSelect={onSelect} onChangeElements={onChangeElements} snapGrid={0} />)

    const handle = screen.getByTestId('resize-se')

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 130, clientY: 100 })
    expect(onChangeElements).not.toHaveBeenCalled()

    fireEvent.pointerUp(window, { clientX: 130, clientY: 100 })
    expect(onChangeElements).toHaveBeenCalledTimes(1)

    const updater = onChangeElements.mock.calls[0][0] as (els: PdfElement[]) => PdfElement[]
    const updated = updater(template.elements)
    const t1 = updated.find(e => e.id === 't1')!
    expect(t1.w).toBeGreaterThan(60) // creció con dx > 0
  })

  it('Shift durante el resize bloquea el ratio w:h inicial del gesto', () => {
    const template = baseTemplate([textEl('t1')]) // w=60, h=10 -> ratio 1:6
    const onChangeElements = vi.fn()
    const onSelect = vi.fn()

    render(<EditorCanvas template={template} selectedIds={['t1']} onSelect={onSelect} onChangeElements={onChangeElements} snapGrid={0} />)

    const handle = screen.getByTestId('resize-se')
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 190, clientY: 100, shiftKey: true }) // dx = +30mm -> w = 90
    fireEvent.pointerUp(window, { clientX: 190, clientY: 100, shiftKey: true })

    const updater = onChangeElements.mock.calls[0][0] as (els: PdfElement[]) => PdfElement[]
    const t1 = updater(template.elements).find(e => e.id === 't1') as { w: number; h?: number }
    expect(t1.w).toBe(90)
    expect(t1.h).toBe(15) // 90 * (10/60), ratio preservado
  })
})

describe('EditorCanvas -- edición directa de texto (doble-click)', () => {
  it('doble-click entra a edición; blur confirma con un solo commit', () => {
    const template = baseTemplate([textEl('t1')])
    const onChangeElements = vi.fn()
    const onSelect = vi.fn()

    render(<EditorCanvas template={template} selectedIds={['t1']} onSelect={onSelect} onChangeElements={onChangeElements} snapGrid={0} />)

    fireEvent.doubleClick(screen.getByTestId('el-t1'))
    const editable = screen.getByTestId('el-t1').querySelector('[contenteditable="true"]') as HTMLElement
    expect(editable).toBeTruthy()

    editable.textContent = 'Texto nuevo'
    fireEvent.blur(editable)

    expect(onChangeElements).toHaveBeenCalledTimes(1)
    const updater = onChangeElements.mock.calls[0][0] as (els: PdfElement[]) => PdfElement[]
    const updated = updater(template.elements)
    expect((updated.find(e => e.id === 't1') as { text: string }).text).toBe('Texto nuevo')
  })

  it('Escape revierte sin llamar onChangeElements', () => {
    const template = baseTemplate([textEl('t1')])
    const onChangeElements = vi.fn()
    const onSelect = vi.fn()

    render(<EditorCanvas template={template} selectedIds={['t1']} onSelect={onSelect} onChangeElements={onChangeElements} snapGrid={0} />)

    fireEvent.doubleClick(screen.getByTestId('el-t1'))
    const editable = screen.getByTestId('el-t1').querySelector('[contenteditable="true"]') as HTMLElement
    editable.textContent = 'Esto no debería guardarse'
    fireEvent.keyDown(editable, { key: 'Escape' })

    expect(onChangeElements).not.toHaveBeenCalled()
    // Al salir de edición vuelve a mostrar el texto original, no el editado.
    expect(screen.getByTestId('el-t1').textContent).toContain('Hola')
  })

  it('doble-click en un elemento no-texto no hace nada', () => {
    const line: PdfElement = { id: 'l1', type: 'line', x: 10, y: 10, w: 50, colorToken: 'ink', weight: 0.5 }
    const template = baseTemplate([line])
    const onChangeElements = vi.fn()
    const onSelect = vi.fn()

    render(<EditorCanvas template={template} selectedIds={[]} onSelect={onSelect} onChangeElements={onChangeElements} snapGrid={0} />)

    fireEvent.doubleClick(screen.getByTestId('el-l1'))
    expect(screen.getByTestId('el-l1').querySelector('[contenteditable="true"]')).toBeNull()
  })
})
