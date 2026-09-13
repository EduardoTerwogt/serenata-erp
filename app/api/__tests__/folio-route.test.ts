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

  // EF-2 1D-3: esta ruta fue la única de las 4 medidas cuyo p95 en Preview
  // (2314ms) superó el gate de 1s -- se revirtió puntualmente a
  // CacheManager (clientes/productos/proveedores sí pasaron y quedaron sin
  // caché). Esta prueba confirma que dos GETs con el mismo query solo
  // consultan el repositorio una vez (cache hit).
  // El cache es un CacheManager de módulo, compartido entre los `it()` de
  // este archivo -- cada caso usa su propio complementaria_de para no
  // pisar la entrada de otro caso.
  it('dos GETs sucesivos con el mismo query solo llaman a previewNextQuotationFolio una vez (cache hit)', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.previewNextQuotationFolioMock.mockResolvedValue('SH010-B')

    await GET(new Request('http://localhost/api/folio?complementaria_de=CACHE-HIT-TEST'))
    await GET(new Request('http://localhost/api/folio?complementaria_de=CACHE-HIT-TEST'))

    expect(mocks.previewNextQuotationFolioMock).toHaveBeenCalledTimes(1)
  })

  it('un query distinto (complementaria_de distinto) no reutiliza la entrada de caché de otro', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.previewNextQuotationFolioMock.mockResolvedValue('SH010-B')

    await GET(new Request('http://localhost/api/folio?complementaria_de=DISTINCT-KEY-A'))
    await GET(new Request('http://localhost/api/folio?complementaria_de=DISTINCT-KEY-B'))

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
