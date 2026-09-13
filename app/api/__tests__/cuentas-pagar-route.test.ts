import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCuentasPagarMock: vi.fn(),
  updateCuentaPagarMock: vi.fn(),
  triggerSheetsSyncMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getCuentasPagar: mocks.getCuentasPagarMock,
  updateCuentaPagar: mocks.updateCuentaPagarMock,
}))

vi.mock('@/lib/integrations/sheets/trigger', () => ({
  triggerSheetsSync: mocks.triggerSheetsSyncMock,
}))

import { PUT } from '../cuentas-pagar/route'

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/cuentas-pagar', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/cuentas-pagar', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset().mockResolvedValue({ response: null })
    mocks.updateCuentaPagarMock.mockReset().mockResolvedValue({ id: 'cuenta-1', notas: 'ok' })
    mocks.triggerSheetsSyncMock.mockReset()
  })

  it.each(['estado', 'fecha_pago', 'monto_pagado'])(
    '1B-4 -- rechaza (400) el update completo si el body incluye "%s", sin llamar a updateCuentaPagar',
    async (forbiddenKey) => {
      const response = await PUT(buildRequest({ id: 'cuenta-1', notas: 'nota válida', [forbiddenKey]: 'x' }))

      expect(response.status).toBe(400)
      expect(mocks.updateCuentaPagarMock).not.toHaveBeenCalled()
    }
  )

  it('1B-4 -- rechaza el update completo si vienen mezclados campos permitidos y prohibidos', async () => {
    const response = await PUT(
      buildRequest({ id: 'cuenta-1', notas: 'nota válida', orden_pago_id: 'op-1', estado: 'PAGADO' })
    )

    expect(response.status).toBe(400)
    expect(mocks.updateCuentaPagarMock).not.toHaveBeenCalled()
  })

  it('permite notas y orden_pago_id', async () => {
    const response = await PUT(buildRequest({ id: 'cuenta-1', notas: 'nota válida', orden_pago_id: 'op-1' }))

    expect(response.status).toBe(200)
    expect(mocks.updateCuentaPagarMock).toHaveBeenCalledWith('cuenta-1', { notas: 'nota válida', orden_pago_id: 'op-1' })
  })

  it('descarta silenciosamente claves desconocidas que no son financieras prohibidas', async () => {
    const response = await PUT(buildRequest({ id: 'cuenta-1', notas: 'nota válida', campo_inventado: 'x' }))

    expect(response.status).toBe(200)
    expect(mocks.updateCuentaPagarMock).toHaveBeenCalledWith('cuenta-1', { notas: 'nota válida' })
  })
})
