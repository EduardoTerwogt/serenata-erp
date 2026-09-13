import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  previewNextQuotationFolioMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/server/quotations/folio', () => ({
  previewNextQuotationFolio: mocks.previewNextQuotationFolioMock,
}))

import { GET } from '../folio/route'

describe('GET /api/folio', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.previewNextQuotationFolioMock.mockReset()
  })

  it('retorna el preview del siguiente folio y limpia el query param complementaria_de', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.previewNextQuotationFolioMock.mockResolvedValue('SH010-B')

    const response = await GET(
      new Request('http://localhost/api/folio?complementaria_de=%20SH010%20'),
    )

    expect(mocks.previewNextQuotationFolioMock).toHaveBeenCalledWith('SH010')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ folio: 'SH010-B' })
  })

  // EF-2 1D-3: se retiró el CacheManager en memoria de este endpoint --
  // esta prueba confirma que dos GETs sucesivos consultan el repositorio
  // las dos veces, no una sola vez servida desde caché.
  it('dos GETs sucesivos llaman a previewNextQuotationFolio las dos veces (sin caché)', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.previewNextQuotationFolioMock.mockResolvedValue('SH010-B')

    await GET(new Request('http://localhost/api/folio'))
    await GET(new Request('http://localhost/api/folio'))

    expect(mocks.previewNextQuotationFolioMock).toHaveBeenCalledTimes(2)
  })

  it('corta la ejecución cuando el endpoint no está autorizado', async () => {
    mocks.requireSectionMock.mockResolvedValue({
      response: Response.json({ error: 'No autorizado' }, { status: 403 }),
    })

    const response = await GET(new Request('http://localhost/api/folio'))

    expect(mocks.previewNextQuotationFolioMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'No autorizado' })
  })
})
