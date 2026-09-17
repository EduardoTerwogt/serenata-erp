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
  sendFormDataMock: vi.fn(async () => ({ success: true })),
  runIdempotentPagoSubmitMock: vi.fn(async (_params: Record<string, unknown>) => ({ success: true })),
}))

vi.mock('@/lib/client/api', () => ({
  getJson: mocks.getJsonMock,
  sendFormData: mocks.sendFormDataMock,
  sendJson: vi.fn(),
}))

vi.mock('@/lib/client/pagoIdempotency', () => ({
  runIdempotentPagoSubmit: mocks.runIdempotentPagoSubmitMock,
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
  mocks.sendFormDataMock.mockClear()
  mocks.runIdempotentPagoSubmitMock.mockClear()
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

// docs/PLAN.md -- agrupación de Cuentas por Pagar: cuando la cuenta
// pertenece a un grupo de facturación, factura y pago se piden/registran
// sobre el grupo (endpoints hermanos bajo /grupos/[grupoId]/...), nunca
// sobre el item individual.
describe('useCuentasPagar - subirFactura/registrarPago con grupoId', () => {
  it('subirFactura sin grupoId apunta al endpoint del item', async () => {
    const { result } = renderHook(() => useCuentasPagar())
    await flush()

    await act(async () => {
      await result.current.subirFactura('cuenta-1', new File([], 'x.xml'), new File([], 'x.pdf'))
    })

    expect(mocks.sendFormDataMock).toHaveBeenCalledWith(
      '/api/cuentas-pagar/cuenta-1/subir-factura',
      expect.any(FormData),
      expect.any(String)
    )
  })

  it('subirFactura con grupoId apunta al endpoint del grupo', async () => {
    const { result } = renderHook(() => useCuentasPagar())
    await flush()

    await act(async () => {
      await result.current.subirFactura('cuenta-1', new File([], 'x.xml'), new File([], 'x.pdf'), 'grupo-1')
    })

    expect(mocks.sendFormDataMock).toHaveBeenCalledWith(
      '/api/cuentas-pagar/grupos/grupo-1/subir-factura',
      expect.any(FormData),
      expect.any(String)
    )
  })

  it('registrarPago sin grupoId usa el dominio/scope del item', async () => {
    const { result } = renderHook(() => useCuentasPagar())
    await flush()

    await act(async () => {
      await result.current.registrarPago('cuenta-1', { monto: 100 })
    })

    expect(mocks.runIdempotentPagoSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'registrar-pago:cuentas-pagar:cuenta-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'cuenta-1',
      })
    )
  })

  it('registrarPago con grupoId usa el dominio/scope del grupo y llama al endpoint del grupo', async () => {
    const { result } = renderHook(() => useCuentasPagar())
    await flush()

    await act(async () => {
      await result.current.registrarPago('cuenta-1', { monto: 100 }, 'grupo-1')
    })

    expect(mocks.runIdempotentPagoSubmitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'registrar-pago:cuentas-pagar-grupos:grupo-1',
        dominio: 'cuentas-pagar-grupos',
        cuentaId: 'grupo-1',
      })
    )

    // El `submit` inyectado es el que de verdad decide la URL -- se invoca
    // manualmente para verificar que apunta al endpoint del grupo, no del item.
    const call = mocks.runIdempotentPagoSubmitMock.mock.calls[0][0] as unknown as { submit: (args: { operationId: string }) => Promise<unknown> }
    await call.submit({ operationId: 'op-1' })
    expect(mocks.sendFormDataMock).toHaveBeenCalledWith(
      '/api/cuentas-pagar/grupos/grupo-1/registrar-pago',
      expect.any(FormData),
      expect.any(String)
    )
  })
})
