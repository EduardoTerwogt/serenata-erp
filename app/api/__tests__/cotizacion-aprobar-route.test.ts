import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSectionMock = vi.fn()
const approveQuotationAndFetchResultMock = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSection: requireSectionMock,
}))

vi.mock('@/lib/server/quotations/approval', () => ({
  approveQuotationAndFetchResult: approveQuotationAndFetchResultMock,
}))

import { POST } from '../cotizaciones/[id]/aprobar/route'

describe('POST /api/cotizaciones/[id]/aprobar', () => {
  beforeEach(() => {
    requireSectionMock.mockReset()
    approveQuotationAndFetchResultMock.mockReset()
  })

  it('delegates approval and preserves status/body from the service', async () => {
    requireSectionMock.mockResolvedValue({ response: null })
    approveQuotationAndFetchResultMock.mockResolvedValue({
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

    expect(approveQuotationAndFetchResultMock).toHaveBeenCalledWith('SH001')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      cotizacion: { id: 'SH001', estado: 'APROBADA' },
      already_approved: false,
    })
  })

  it('corta la ejecución cuando el usuario no tiene acceso', async () => {
    requireSectionMock.mockResolvedValue({
      response: Response.json({ error: 'No autorizado' }, { status: 403 }),
    })

    const response = await POST(
      new Request('http://localhost/api/cotizaciones/SH001/aprobar', { method: 'POST' }),
      { params: Promise.resolve({ id: 'SH001' }) },
    )

    expect(approveQuotationAndFetchResultMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'No autorizado' })
  })
})
