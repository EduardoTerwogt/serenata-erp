// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EF-3 3B-3: useCuentasPagar agrega debounce (300ms) + AbortController +
 * numero de secuencia a la busqueda server-side (mismo mecanismo que
 * useCuentasCobrar en 3B-2) -- este archivo cubre esa resiliencia con
 * fetch simulado en vez de red real.
 */

const mocks = vi.hoisted(() => ({
  getJsonMock: vi.fn(),
}))

vi.mock('@/lib/client/api', () => ({
  getJson: mocks.getJsonMock,
  sendFormData: vi.fn(),
  sendJson: vi.fn(),
}))

import { useCuentasPagar } from '../useCuentasPagar'

function respuestaVacia(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rows: [],
    total_rows: 0,
    total_monto_pendiente: 0,
    total_monto_pagado: 0,
    pendientes_count: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getJsonMock.mockReset()
  mocks.getJsonMock.mockResolvedValue(respuestaVacia())
})

afterEach(() => {
  vi.useRealTimers()
})

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useCuentasPagar - busqueda server-side', () => {
  it('carga la primera pagina sin busqueda al montar', async () => {
    renderHook(() => useCuentasPagar())
    await flush()
    expect(mocks.getJsonMock).toHaveBeenCalledTimes(1)
    expect(mocks.getJsonMock.mock.calls[0][0]).toBe('/api/cuentas-pagar?page=1&pageSize=50')
  })

  it('hace debounce de 300ms: teclas rapidas solo disparan un fetch con el ultimo valor', async () => {
    const { result } = renderHook(() => useCuentasPagar())
    await flush() // fetch inicial

    mocks.getJsonMock.mockClear()

    act(() => { result.current.setBusqueda('I') })
    await flush(100)
    act(() => { result.current.setBusqueda('IT') })
    await flush(100)
    act(() => { result.current.setBusqueda('ITEM_01') })

    await flush(299)
    expect(mocks.getJsonMock).not.toHaveBeenCalled()

    await flush(1)
    expect(mocks.getJsonMock).toHaveBeenCalledTimes(1)
    expect(mocks.getJsonMock.mock.calls[0][0]).toBe('/api/cuentas-pagar?search=ITEM_01&page=1&pageSize=50')
  })

  it('ignora una respuesta atrasada que llega despues de una mas nueva (numero de secuencia)', async () => {
    const { result } = renderHook(() => useCuentasPagar())
    await flush() // fetch inicial

    let resolveFirst!: (value: unknown) => void
    let resolveSecond!: (value: unknown) => void
    mocks.getJsonMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))

    act(() => { result.current.setBusqueda('viejo') })
    await flush(300)
    act(() => { result.current.setBusqueda('viejonuevo') })
    await flush(300)

    expect(mocks.getJsonMock).toHaveBeenCalledTimes(3)

    await act(async () => {
      resolveSecond(respuestaVacia({ rows: [{ id: 'nuevo' }], total_rows: 1 }))
    })
    expect(result.current.totalRows).toBe(1)

    await act(async () => {
      resolveFirst(respuestaVacia({ rows: [{ id: 'viejo' }], total_rows: 99 }))
    })

    expect(result.current.totalRows).toBe(1)
    expect(result.current.cuentas).toEqual([{ id: 'nuevo' }])
  })

  it('cambiar la busqueda reinicia a la pagina 1', async () => {
    mocks.getJsonMock.mockResolvedValue(respuestaVacia({ total_rows: 200 }))
    const { result } = renderHook(() => useCuentasPagar())
    await flush()

    act(() => { result.current.setPage(3) })
    await flush()
    expect(result.current.page).toBe(3)

    act(() => { result.current.setBusqueda('item') })
    await flush(300)
    expect(result.current.page).toBe(1)
  })
})
