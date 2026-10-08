import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  reintentarMock: vi.fn(),
  envMock: vi.fn(() => ({ driveFolderIdCuentas: 'raiz' })),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.envMock }))
vi.mock('@/lib/server/cuentas/archivos-pendientes', () => ({ reintentarSubida: mocks.reintentarMock }))

import { POST } from '../cuentas/documentos/[id]/reintentar-subida/route'

const ID = '5eedc000-0000-4000-8000-000000000001'
const params = (id = ID) => ({ params: Promise.resolve({ id }) })
const peticion = (campos: { lado?: string; archivo?: boolean }) => {
  const fd = new FormData()
  if (campos.lado) fd.set('lado', campos.lado)
  if (campos.archivo) fd.set('archivo', new File(['%PDF'], 'f.pdf', { type: 'application/pdf' }))
  return new Request('http://x', { method: 'POST', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null, session: { user: { email: 'staff@serenata.test' } } })
  mocks.reintentarMock.mockResolvedValue({ status: 200, body: { success: true, pendiente: false } })
})

describe('POST /api/cuentas/documentos/[id]/reintentar-subida', () => {
  it('exige la sección Cuentas antes de hacer nada', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await POST(peticion({ lado: 'cobro', archivo: true }), params())
    expect(res.status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('cuentas')
    expect(mocks.reintentarMock).not.toHaveBeenCalled()
  })

  it('valida el id, el lado y el archivo', async () => {
    expect((await POST(peticion({ lado: 'cobro', archivo: true }), params('no-uuid'))).status).toBe(400)
    expect((await POST(peticion({ lado: 'otro', archivo: true }), params())).status).toBe(400)
    expect((await POST(peticion({ lado: 'cobro' }), params())).status).toBe(400)
    expect(mocks.reintentarMock).not.toHaveBeenCalled()
  })

  it('con datos válidos delega y devuelve su respuesta', async () => {
    const res = await POST(peticion({ lado: 'proveedor', archivo: true }), params())
    expect(res.status).toBe(200)
    expect(mocks.reintentarMock).toHaveBeenCalledWith(expect.objectContaining({ lado: 'proveedor', id: ID, folderId: 'raiz' }))
  })

  it('sin Google Drive configurado responde 500 claro', async () => {
    mocks.envMock.mockReturnValueOnce(null as never)
    const res = await POST(peticion({ lado: 'cobro', archivo: true }), params())
    expect(res.status).toBe(500)
  })
})
