import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readPendingOperationMock: vi.fn(),
  createPendingOperationMock: vi.fn(),
  clearPendingOperationMock: vi.fn(),
  computeClientPayloadHashMock: vi.fn(async () => 'fingerprint-1'),
}))

vi.mock('@/lib/client/pendingOperation', () => ({
  readPendingOperation: mocks.readPendingOperationMock,
  createPendingOperation: mocks.createPendingOperationMock,
  clearPendingOperation: mocks.clearPendingOperationMock,
}))

vi.mock('@/lib/shared/canonicalPayload', () => ({
  computeClientPayloadHash: mocks.computeClientPayloadHashMock,
}))

import { runIdempotentBulkImportSubmit, type BulkImportPayload } from '../bulkImportIdempotency'
import { Cotizacion } from '@/lib/types'

// Las pruebas de este archivo solo les importa la IDENTIDAD de la
// cotización devuelta (para distinguir "resultado nuevo" de "resultado
// reconciliado viejo"), nunca su forma completa -- cast deliberado en vez
// de rellenar los ~15 campos de `Cotizacion` que son irrelevantes aquí.
function fakeCotizacion(id: string): Cotizacion {
  return { id } as Cotizacion
}

function payload(overrides?: Partial<BulkImportPayload>): BulkImportPayload {
  return {
    items: [{ id: 'item-1', categoria: 'Equipo', descripcion: 'Item', cantidad: 1, precio_unitario: 100, importe: 100, responsable_id: null, responsable_nombre: null, x_pagar: 0, margen: 100, orden: 0, notas: null }],
    reemplazar_ids: [],
    cotizacionId: 'cot-1',
    ...overrides,
  }
}

describe('runIdempotentBulkImportSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.computeClientPayloadHashMock.mockResolvedValue('fingerprint-1')
    mocks.createPendingOperationMock.mockReturnValue(true)
  })

  it('unavailable: rechaza sin intentar red, nunca envía nada', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'unavailable' })
    const submit = vi.fn()

    await expect(
      runIdempotentBulkImportSubmit({
        scope: 'scope-1',
        cotizacionId: 'cot-1',
        buildCandidatePayload: () => payload(),
        submit,
      })
    ).rejects.toThrow(/verificar el estado/)

    expect(submit).not.toHaveBeenCalled()
  })

  it('none: genera un operationId nuevo, persiste ANTES del fetch, limpia en éxito', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    const callOrder: string[] = []
    mocks.createPendingOperationMock.mockImplementation(() => { callOrder.push('create'); return true })
    const submit = vi.fn(async () => { callOrder.push('submit'); return { cotizacion: fakeCotizacion('cot-1') } })

    const result = await runIdempotentBulkImportSubmit({
      scope: 'scope-1',
      cotizacionId: 'cot-1',
      buildCandidatePayload: () => payload(),
      submit,
    })

    expect(result).toEqual({ cotizacion: fakeCotizacion('cot-1') })
    expect(mocks.createPendingOperationMock).toHaveBeenCalledWith('scope-1', 'fingerprint-1', expect.any(String), payload())
    expect(callOrder).toEqual(['create', 'submit'])
    expect(mocks.clearPendingOperationMock).toHaveBeenCalledWith('scope-1')
  })

  it('createdNow: si createPendingOperation falla (storage no disponible), rechaza sin llamar submit', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    mocks.createPendingOperationMock.mockReturnValue(false)
    const submit = vi.fn()

    await expect(
      runIdempotentBulkImportSubmit({
        scope: 'scope-1',
        cotizacionId: 'cot-1',
        buildCandidatePayload: () => payload(),
        submit,
      })
    ).rejects.toThrow(/de forma segura/)

    expect(submit).not.toHaveBeenCalled()
  })

  it('mismo fingerprint FRESH (reusedExisting): reutiliza operationId + payload PERSISTIDO, NO reconcilia, NO llama createPendingOperation', async () => {
    const persistedPayload = payload({ cotizacionId: 'cot-1-persistido' })
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'fresh',
      op: { operationId: 'op-existente', fingerprint: 'fingerprint-1', status: 'pending', createdAt: Date.now(), payload: persistedPayload },
    })
    const reconcile = vi.fn()
    const submit = vi.fn(async () => ({ cotizacion: fakeCotizacion('cot-1') }))

    await runIdempotentBulkImportSubmit({
      scope: 'scope-1',
      cotizacionId: 'cot-1',
      // Payload recién recalculado DISTINTO del persistido -- debe ganar el persistido.
      buildCandidatePayload: () => payload({ cotizacionId: 'cot-1-recalculado' }),
      submit,
      reconcile,
    })

    expect(mocks.createPendingOperationMock).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledWith({ operationId: 'op-existente', payload: persistedPayload })
  })

  it('fingerprint distinto + reconciliación not_found: bloquea, nunca envía, nunca limpia', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'fresh',
      op: { operationId: 'op-viejo', fingerprint: 'fingerprint-viejo', status: 'pending', createdAt: Date.now() },
    })
    const reconcile = vi.fn(async () => ({ status: 'not_found' as const }))
    const submit = vi.fn()

    await expect(
      runIdempotentBulkImportSubmit({
        scope: 'scope-1',
        cotizacionId: 'cot-1',
        buildCandidatePayload: () => payload(),
        submit,
        reconcile,
      })
    ).rejects.toThrow(/pendiente de confirmar/)

    expect(submit).not.toHaveBeenCalled()
    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('fingerprint distinto + reconciliación ambiguous: bloquea igual que not_found', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'fresh',
      op: { operationId: 'op-viejo', fingerprint: 'fingerprint-viejo', status: 'pending', createdAt: Date.now() },
    })
    const reconcile = vi.fn(async () => ({ status: 'ambiguous' as const }))
    const submit = vi.fn()

    await expect(
      runIdempotentBulkImportSubmit({
        scope: 'scope-1',
        cotizacionId: 'cot-1',
        buildCandidatePayload: () => payload(),
        submit,
        reconcile,
      })
    ).rejects.toThrow(/pendiente de confirmar/)

    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('fingerprint distinto + reconciliación completed: limpia y reintenta con operationId y payload NUEVOS', async () => {
    mocks.readPendingOperationMock
      .mockReturnValueOnce({
        kind: 'fresh',
        op: { operationId: 'op-viejo', fingerprint: 'fingerprint-viejo', status: 'pending', createdAt: Date.now() },
      })
      .mockReturnValueOnce({ kind: 'none' })
    const reconcile = vi.fn(async () => ({ status: 'completed' as const, result: { cotizacion: fakeCotizacion('viejo') } }))
    const submit = vi.fn(async () => ({ cotizacion: fakeCotizacion('nuevo') }))
    let buildCount = 0

    const result = await runIdempotentBulkImportSubmit({
      scope: 'scope-1',
      cotizacionId: 'cot-1',
      buildCandidatePayload: () => { buildCount += 1; return payload() },
      submit,
      reconcile,
    })

    // El resultado es el de la operación NUEVA, nunca el reconciliado de la vieja.
    expect(result).toEqual({ cotizacion: fakeCotizacion('nuevo') })
    expect(buildCount).toBe(2) // una vez por intento
    expect(submit).toHaveBeenCalledTimes(1)
    expect(mocks.clearPendingOperationMock).toHaveBeenCalledWith('scope-1')
  })

  it('mismo fingerprint STALE + reconciliación completed: usa el resultado ya confirmado, NUNCA reenvía', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'stale',
      op: { operationId: 'op-existente', fingerprint: 'fingerprint-1', status: 'pending', createdAt: Date.now() - 120_000, payload: payload() },
    })
    const reconcile = vi.fn(async () => ({ status: 'completed' as const, result: { cotizacion: fakeCotizacion('confirmado-antes') } }))
    const submit = vi.fn(async () => ({ cotizacion: fakeCotizacion('NUNCA-DEBERIA-VERSE') }))

    const result = await runIdempotentBulkImportSubmit({
      scope: 'scope-1',
      cotizacionId: 'cot-1',
      buildCandidatePayload: () => payload(),
      submit,
      reconcile,
    })

    expect(reconcile).toHaveBeenCalledWith('cot-1', 'op-existente')
    expect(result).toEqual({ cotizacion: fakeCotizacion('confirmado-antes') })
    expect(submit).not.toHaveBeenCalled()
    expect(mocks.clearPendingOperationMock).toHaveBeenCalledWith('scope-1')
  })

  it('mismo fingerprint STALE + reconciliación not_found: permite el retry EXACTO (mismo operationId, mismo payload persistido)', async () => {
    const persistedPayload = payload({ cotizacionId: 'cot-1-persistido' })
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'stale',
      op: { operationId: 'op-existente', fingerprint: 'fingerprint-1', status: 'pending', createdAt: Date.now() - 120_000, payload: persistedPayload },
    })
    const reconcile = vi.fn(async () => ({ status: 'not_found' as const }))
    const submit = vi.fn(async () => ({ cotizacion: fakeCotizacion('cot-1') }))

    const result = await runIdempotentBulkImportSubmit({
      scope: 'scope-1',
      cotizacionId: 'cot-1',
      buildCandidatePayload: () => payload({ cotizacionId: 'cot-1-recalculado' }),
      submit,
      reconcile,
    })

    expect(result).toEqual({ cotizacion: fakeCotizacion('cot-1') })
    expect(submit).toHaveBeenCalledWith({ operationId: 'op-existente', payload: persistedPayload })
    expect(mocks.createPendingOperationMock).not.toHaveBeenCalled()
  })

  it('mismo fingerprint STALE + reconciliación ambiguous: mismo retry EXACTO que not_found', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'stale',
      op: { operationId: 'op-existente', fingerprint: 'fingerprint-1', status: 'pending', createdAt: Date.now() - 120_000, payload: payload() },
    })
    const reconcile = vi.fn(async () => ({ status: 'ambiguous' as const }))
    const submit = vi.fn(async () => ({ cotizacion: fakeCotizacion('cot-1') }))

    const result = await runIdempotentBulkImportSubmit({
      scope: 'scope-1',
      cotizacionId: 'cot-1',
      buildCandidatePayload: () => payload(),
      submit,
      reconcile,
    })

    expect(result).toEqual({ cotizacion: fakeCotizacion('cot-1') })
    expect(submit).toHaveBeenCalledWith({ operationId: 'op-existente', payload: payload() })
  })

  it('error del submit (post-fetch): nunca limpia', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    const submit = vi.fn(async () => { throw new Error('network error') })

    await expect(
      runIdempotentBulkImportSubmit({
        scope: 'scope-1',
        cotizacionId: 'cot-1',
        buildCandidatePayload: () => payload(),
        submit,
      })
    ).rejects.toThrow('network error')

    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('hallazgo de auditoría PR #29: un 2xx SIN `cotizacion` no limpia el registro pendiente', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    // Simula un 2xx con body malformado (sin el contrato de éxito esperado).
    const submit = vi.fn(async () => ({}) as { cotizacion?: never })

    await expect(
      runIdempotentBulkImportSubmit({
        scope: 'scope-1',
        cotizacionId: 'cot-1',
        buildCandidatePayload: () => payload(),
        submit,
      })
    ).rejects.toThrow(/Respuesta inválida/)

    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })
})
