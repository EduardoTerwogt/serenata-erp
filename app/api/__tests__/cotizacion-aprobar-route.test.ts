import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  approveQuotationAndFetchResultMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/server/quotations/approval', () => ({
  approveQuotationAndFetchResult: mocks.approveQuotationAndFetchResultMock,
}))

import { POST } from '../cotizaciones/[id]/aprobar/route'

describe('POST /api/cotizaciones/[id]/aprobar', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.approveQuotationAndFetchResultMock.mockReset()
  })

  it('delegates approval and preserves status/body from the service', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.approveQuotationAndFetchResultMock.mockResolvedValue({
      status: 200,
      body: {
        cotizacion: { id: 'SH001', estado: 'APROBADA' },
        already_approved: false,
      },
    })

    const response = await POST(
      new Request('http://localhost/api/cotizaciones/SH001/aprobar', { method: 'POST' }),
      { params: Promise.resolve({ id: 'SH001' }) },
    )

    expect(mocks.approveQuotationAndFetchResultMock).toHaveBeenCalledWith('SH001')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      cotizacion: { id: 'SH001', estado: 'APROBADA' },
      already_approved: false,
    })
  })

  it('corta la ejecución cuando el usuario no tiene acceso', async () => {
    mocks.requireSectionMock.mockResolvedValue({
      response: Response.json({ error: 'No autorizado' }, { status: 403 }),
    })

    const response = await POST(
      new Request('http://localhost/api/cotizaciones/SH001/aprobar', { method: 'POST' }),
      { params: Promise.resolve({ id: 'SH001' }) },
    )

    expect(mocks.approveQuotationAndFetchResultMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'No autorizado' })
  })
})
