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

  // EF-2 1D-3: el gate de p95 en Preview mostró 2314ms sin caché (>1s) para
  // esta ruta -- única de las 4 medidas que no pasó. El caché se restauró,
  // pero vive en lib/server/quotations/folio.ts (dentro de
  // previewNextQuotationFolio), no en esta ruta -- approval.ts, capa
  // server, también necesita invalidarlo, y una dependencia lib/server ->
  // app/api invertiría el layering. El comportamiento de caché en sí se
  // prueba en lib/server/quotations/__tests__/folio.test.ts; aquí solo se
  // confirma que la ruta delega cada request, sin lógica propia de por
  // medio.
  it('dos GETs sucesivos delegan a previewNextQuotationFolio en cada llamada', async () => {
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
