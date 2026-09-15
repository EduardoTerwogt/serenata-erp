import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainError } from '@/lib/server/errors/domain-error'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  cancelQuotationMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/server/quotations/cancellation', () => ({
  cancelQuotation: mocks.cancelQuotationMock,
}))

import { POST } from '../cotizaciones/[id]/cancelar/route'

const params = Promise.resolve({ id: 'SH001' })

describe('POST /api/cotizaciones/[id]/cancelar', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.cancelQuotationMock.mockReset()
    mocks.requireSectionMock.mockResolvedValue({ response: null })
  })

  it('éxito -- delega en cancelQuotation y devuelve su resultado', async () => {
    mocks.cancelQuotationMock.mockResolvedValue({ id: 'SH001', estado: 'CANCELADA' })
    const res = await POST(new Request('http://x', { method: 'POST' }), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'SH001', estado: 'CANCELADA' })
  })

  it('EF-3 3D-9: DomainError con status propio (403) se preserva, safeMessage sin detalle crudo', async () => {
    mocks.cancelQuotationMock.mockRejectedValue(new DomainError({
      code: 'estado_invalido',
      status: 403,
      safeMessage: 'Solo se pueden cancelar cotizaciones en estado EMITIDA o APROBADA. Estado actual: BORRADOR',
    }))
    const res = await POST(new Request('http://x', { method: 'POST' }), { params })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('Solo se pueden cancelar')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('EF-3 3D-9: un error de Postgres sin envolver nunca expone su mensaje crudo al cliente', async () => {
    mocks.cancelQuotationMock.mockRejectedValue(new Error('relation "cuentas_cobrar" does not exist'))
    const res = await POST(new Request('http://x', { method: 'POST' }), { params })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('cuentas_cobrar')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('corta la ejecución cuando el usuario no tiene acceso', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await POST(new Request('http://x', { method: 'POST' }), { params })
    expect(mocks.cancelQuotationMock).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
  })
})
