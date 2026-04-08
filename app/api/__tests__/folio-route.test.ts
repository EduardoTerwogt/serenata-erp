import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSectionMock = vi.fn()
const previewNextQuotationFolioMock = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSection: requireSectionMock,
}))

vi.mock('@/lib/server/quotations/folio', () => ({
  previewNextQuotationFolio: previewNextQuotationFolioMock,
}))

import { GET } from '../folio/route'

describe('GET /api/folio', () => {
  beforeEach(() => {
    requireSectionMock.mockReset()
    previewNextQuotationFolioMock.mockReset()
  })

  it('retorna el preview del siguiente folio y limpia el query param complementaria_de', async () => {
    requireSectionMock.mockResolvedValue({ response: null })
    previewNextQuotationFolioMock.mockResolvedValue('SH010-B')

    const response = await GET(
      new Request('http://localhost/api/folio?complementaria_de=%20SH010%20'),
    )

    expect(previewNextQuotationFolioMock).toHaveBeenCalledWith('SH010')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ folio: 'SH010-B' })
  })

  it('corta la ejecución cuando el endpoint no está autorizado', async () => {
    requireSectionMock.mockResolvedValue({
      response: Response.json({ error: 'No autorizado' }, { status: 403 }),
    })

    const response = await GET(new Request('http://localhost/api/folio'))

    expect(previewNextQuotationFolioMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'No autorizado' })
  })
})
