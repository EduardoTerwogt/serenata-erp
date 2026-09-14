// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EF-3 3B-2: useCuentasCobrar agrega debounce (300ms) + AbortController +
 * numero de secuencia a la busqueda server-side -- este archivo cubre esa
 * resiliencia (debounce real, respuesta atrasada descartada) de forma
 * determinista, con fetch simulado en vez de red real.
 */

const mocks = vi.hoisted(() => ({
  getJsonMock: vi.fn(),
}))

vi.mock('@/lib/client/api', () => ({
  getJson: mocks.getJsonMock,
  sendFormData: vi.fn(),
}))

import { useCuentasCobrar } from '../useCuentasCobrar'

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

describe('useCuentasCobrar - busqueda server-side', () => {
  it('carga la primera pagina sin busqueda al montar', async () => {
    renderHook(() => useCuentasCobrar())
    await flush()
    expect(mocks.getJsonMock).toHaveBeenCalledTimes(1)
    expect(mocks.getJsonMock.mock.calls[0][0]).toBe('/api/cuentas-cobrar?page=1&pageSize=50')
  })

  it('hace debounce de 300ms: teclas rapidas solo disparan un fetch con el ultimo valor', async () => {
    const { result } = renderHook(() => useCuentasCobrar())
    await flush() // fetch inicial

    mocks.getJsonMock.mockClear()

    act(() => { result.current.setBusqueda('S') })
    await flush(100)
    act(() => { result.current.setBusqueda('SH') })
    await flush(100)
    act(() => { result.current.setBusqueda('SH001') })

    // Antes de los 300ms desde la ultima tecla, no debe haber disparado nada.
    await flush(299)
    expect(mocks.getJsonMock).not.toHaveBeenCalled()

    await flush(1)
    expect(mocks.getJsonMock).toHaveBeenCalledTimes(1)
    expect(mocks.getJsonMock.mock.calls[0][0]).toBe('/api/cuentas-cobrar?search=SH001&page=1&pageSize=50')
  })

  it('ignora una respuesta atrasada que llega despues de una mas nueva (numero de secuencia)', async () => {
    const { result } = renderHook(() => useCuentasCobrar())
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

    // 1 fetch inicial (montaje) + 1 por cada termino de busqueda -- ambos
    // quedan en vuelo (las 2 implementaciones "once" nunca resuelven solas).
    expect(mocks.getJsonMock).toHaveBeenCalledTimes(3)

    // La respuesta MAS NUEVA ("viejonuevo") llega primero...
    await act(async () => {
      resolveSecond(respuestaVacia({ rows: [{ id: 'nuevo' }], total_rows: 1 }))
    })
    expect(result.current.totalRows).toBe(1)

    // ...y la respuesta VIEJA ("viejo") llega despues -- no debe pisar el
    // estado ya actualizado por la respuesta mas reciente.
    await act(async () => {
      resolveFirst(respuestaVacia({ rows: [{ id: 'viejo' }], total_rows: 99 }))
    })

    expect(result.current.totalRows).toBe(1)
    expect(result.current.cuentas).toEqual([{ id: 'nuevo' }])
  })

  it('cambiar la busqueda reinicia a la pagina 1', async () => {
    mocks.getJsonMock.mockResolvedValue(respuestaVacia({ total_rows: 200 }))
    const { result } = renderHook(() => useCuentasCobrar())
    await flush()

    act(() => { result.current.setPage(3) })
    await flush()
    expect(result.current.page).toBe(3)

    act(() => { result.current.setBusqueda('folio') })
    await flush(300)
    expect(result.current.page).toBe(1)
  })
})
