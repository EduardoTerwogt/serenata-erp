import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readPendingOperationMock: vi.fn(),
  createPendingOperationMock: vi.fn(),
  clearPendingOperationMock: vi.fn(),
  computeClientFileHashMock: vi.fn(async () => 'file-hash'),
  computeClientPayloadHashMock: vi.fn(async () => 'fingerprint-1'),
  reconcilePagoEstadoMock: vi.fn(),
}))

vi.mock('@/lib/client/pendingOperation', () => ({
  readPendingOperation: mocks.readPendingOperationMock,
  createPendingOperation: mocks.createPendingOperationMock,
  clearPendingOperation: mocks.clearPendingOperationMock,
}))

vi.mock('@/lib/shared/canonicalPayload', () => ({
  computeClientFileHash: mocks.computeClientFileHashMock,
  computeClientPayloadHash: mocks.computeClientPayloadHashMock,
}))

vi.mock('@/lib/client/reconcilePago', () => ({
  reconcilePagoEstado: mocks.reconcilePagoEstadoMock,
}))

import { runIdempotentPagoSubmit } from '../pagoIdempotency'

describe('runIdempotentPagoSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.computeClientFileHashMock.mockResolvedValue('file-hash')
    mocks.computeClientPayloadHashMock.mockResolvedValue('fingerprint-1')
    mocks.createPendingOperationMock.mockReturnValue(true)
  })

  it('unavailable: rechaza sin intentar red, nunca envía nada', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'unavailable' })
    const submit = vi.fn()

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        normalize: async (f) => f,
        submit,
      })
    ).rejects.toThrow(/verificar el estado/)

    expect(submit).not.toHaveBeenCalled()
  })

  it('none: genera un operationId nuevo, persiste ANTES del fetch, limpia en éxito', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    const submit = vi.fn(async () => ({ ok: true }))
    const callOrder: string[] = []
    mocks.createPendingOperationMock.mockImplementation(() => {
      callOrder.push('create')
      return true
    })
    submit.mockImplementation(async () => {
      callOrder.push('submit')
      return { ok: true }
    })

    const result = await runIdempotentPagoSubmit({
      scope: 'scope-1',
      dominio: 'cuentas-pagar',
      cuentaId: 'c1',
      fields: { monto: 100 },
      normalize: async (f) => f,
      submit,
    })

    expect(result).toEqual({ ok: true })
    expect(mocks.createPendingOperationMock).toHaveBeenCalledWith('scope-1', 'fingerprint-1', expect.any(String))
    expect(callOrder).toEqual(['create', 'submit'])
    expect(mocks.clearPendingOperationMock).toHaveBeenCalledWith('scope-1')
  })

  it('createdNow: si createPendingOperation falla (storage no disponible), rechaza sin llamar submit', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    mocks.createPendingOperationMock.mockReturnValue(false)
    const submit = vi.fn()

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        normalize: async (f) => f,
        submit,
      })
    ).rejects.toThrow(/de forma segura/)

    expect(submit).not.toHaveBeenCalled()
  })

  it('mismo fingerprint (reusedExisting): reutiliza el operationId existente, NO llama createPendingOperation', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'fresh',
      op: { operationId: 'op-existente', fingerprint: 'fingerprint-1', status: 'pending', createdAt: Date.now() },
    })
    const submit = vi.fn(async () => ({ ok: true }))

    await runIdempotentPagoSubmit({
      scope: 'scope-1',
      dominio: 'cuentas-pagar',
      cuentaId: 'c1',
      fields: { monto: 100 },
      normalize: async (f) => f,
      submit,
    })

    expect(mocks.createPendingOperationMock).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledWith({ operationId: 'op-existente', comprobante: undefined })
  })

  it('fingerprint distinto + reconciliación not_found: bloquea, nunca envía, nunca limpia', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'fresh',
      op: { operationId: 'op-viejo', fingerprint: 'fingerprint-viejo', status: 'pending', createdAt: Date.now() },
    })
    mocks.reconcilePagoEstadoMock.mockResolvedValue('not_found')
    const submit = vi.fn()

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        normalize: async (f) => f,
        submit,
      })
    ).rejects.toThrow(/pendiente de confirmar/)

    expect(submit).not.toHaveBeenCalled()
    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('fingerprint distinto + reconciliación ambiguous: bloquea igual que not_found, nunca limpia', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'stale',
      op: { operationId: 'op-viejo', fingerprint: 'fingerprint-viejo', status: 'pending', createdAt: Date.now() },
    })
    mocks.reconcilePagoEstadoMock.mockResolvedValue('ambiguous')
    const submit = vi.fn()

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        normalize: async (f) => f,
        submit,
      })
    ).rejects.toThrow(/pendiente de confirmar/)

    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('fingerprint distinto + reconciliación completed: limpia y reintenta con un operationId nuevo', async () => {
    mocks.readPendingOperationMock
      .mockReturnValueOnce({
        kind: 'fresh',
        op: { operationId: 'op-viejo', fingerprint: 'fingerprint-viejo', status: 'pending', createdAt: Date.now() },
      })
      .mockReturnValueOnce({ kind: 'none' })
    mocks.reconcilePagoEstadoMock.mockResolvedValue('completed')
    const submit = vi.fn(async () => ({ ok: true }))

    const result = await runIdempotentPagoSubmit({
      scope: 'scope-1',
      dominio: 'cuentas-pagar',
      cuentaId: 'c1',
      fields: { monto: 100 },
      normalize: async (f) => f,
      submit,
    })

    expect(result).toEqual({ ok: true })
    expect(mocks.clearPendingOperationMock).toHaveBeenCalledWith('scope-1') // una vez por el completed, otra por el éxito
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('createdNow + fallo de normalize (pre-fetch): limpia, nunca llama submit', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    const submit = vi.fn()
    const normalize = vi.fn(async () => {
      throw new Error('comprobante inválido')
    })

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        comprobante: new File(['x'], 'foto.jpg', { type: 'image/jpeg' }),
        normalize,
        submit,
      })
    ).rejects.toThrow('comprobante inválido')

    expect(submit).not.toHaveBeenCalled()
    expect(mocks.clearPendingOperationMock).toHaveBeenCalledWith('scope-1')
  })

  it('reusedExisting + fallo de normalize (pre-fetch): NO limpia -- un intento anterior pudo haber hecho commit', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'fresh',
      op: { operationId: 'op-existente', fingerprint: 'fingerprint-1', status: 'pending', createdAt: Date.now() },
    })
    const submit = vi.fn()
    const normalize = vi.fn(async () => {
      throw new Error('comprobante inválido')
    })

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        comprobante: new File(['x'], 'foto.jpg', { type: 'image/jpeg' }),
        normalize,
        submit,
      })
    ).rejects.toThrow('comprobante inválido')

    expect(submit).not.toHaveBeenCalled()
    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('error del submit (post-fetch): nunca limpia, sea cual sea la procedencia (createdNow)', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    const submit = vi.fn(async () => {
      throw new Error('network error')
    })

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        normalize: async (f) => f,
        submit,
      })
    ).rejects.toThrow('network error')

    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('error del submit (post-fetch) con reusedExisting: tampoco limpia', async () => {
    mocks.readPendingOperationMock.mockReturnValue({
      kind: 'fresh',
      op: { operationId: 'op-existente', fingerprint: 'fingerprint-1', status: 'pending', createdAt: Date.now() },
    })
    const submit = vi.fn(async () => {
      throw new Error('network error')
    })

    await expect(
      runIdempotentPagoSubmit({
        scope: 'scope-1',
        dominio: 'cuentas-pagar',
        cuentaId: 'c1',
        fields: { monto: 100 },
        normalize: async (f) => f,
        submit,
      })
    ).rejects.toThrow('network error')

    expect(mocks.clearPendingOperationMock).not.toHaveBeenCalled()
  })

  it('fingerprint incluye el hash del comprobante original -- se calcula antes de normalize()', async () => {
    mocks.readPendingOperationMock.mockReturnValue({ kind: 'none' })
    const originalFile = new File(['contenido-original'], 'foto.jpg', { type: 'image/jpeg' })
    const normalize = vi.fn(async () => new File(['comprimido'], 'foto.jpg', { type: 'image/jpeg' }))
    const submit = vi.fn(async () => ({ ok: true }))

    await runIdempotentPagoSubmit({
      scope: 'scope-1',
      dominio: 'cuentas-pagar',
      cuentaId: 'c1',
      fields: { monto: 100 },
      comprobante: originalFile,
      normalize,
      submit,
    })

    expect(mocks.computeClientFileHashMock).toHaveBeenCalledWith(originalFile)
    expect(normalize).toHaveBeenCalledWith(originalFile)
  })
})
