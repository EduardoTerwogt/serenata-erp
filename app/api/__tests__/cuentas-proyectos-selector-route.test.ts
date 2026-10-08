import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async (_s: string) => ({ response: null as Response | null })),
  cargarMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/cuentas/proyectos-selector', () => ({ cargarSelectorProyectos: mocks.cargarMock }))

import { GET } from '../cuentas/proyectos-selector/route'

const CONTRAPARTE = '5eedc000-0000-4000-8000-00000000c001'
const req = (qs: string) => new Request(`http://x/api/cuentas/proyectos-selector${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.cargarMock.mockResolvedValue({ modo: 'renglones', total: 0, page: 1, page_size: 25, proyectos: [] })
})

describe('GET /api/cuentas/proyectos-selector (#130)', () => {
  it('exige la sección cuentas (solo cuentas, no responsables)', async () => {
    mocks.requireSectionMock.mockResolvedValueOnce({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await GET(req('?modo=renglones'))
    expect(res.status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('cuentas')
    expect(mocks.cargarMock).not.toHaveBeenCalled()
  })

  it('valida modo, lado y tamaño de página antes de consultar', async () => {
    expect((await GET(req('?modo=otro'))).status).toBe(400)
    expect((await GET(req('?modo=pago'))).status).toBe(400) // el pago necesita lado
    expect((await GET(req('?modo=pago&lado=otro'))).status).toBe(400)
    expect((await GET(req('?modo=renglones&page_size=500'))).status).toBe(400)
    expect((await GET(req('?modo=renglones&contraparte=no-es-uuid'))).status).toBe(400)
    expect(mocks.cargarMock).not.toHaveBeenCalled()
  })

  it('pasa los filtros con sus valores por omisión: solo pendientes, página 1 de 25', async () => {
    const res = await GET(req('?modo=renglones'))
    expect(res.status).toBe(200)
    expect(mocks.cargarMock).toHaveBeenCalledWith({ modo: 'renglones', lado: undefined, q: undefined, contraparte: undefined, soloPendientes: true, page: 1, pageSize: 25 })
  })

  it('traduce el texto, la contraparte y solo_pendientes=false', async () => {
    await GET(req(`?modo=pago&lado=proveedor&q=Altavista&contraparte=${CONTRAPARTE}&solo_pendientes=false&page=2&page_size=10`))
    expect(mocks.cargarMock).toHaveBeenCalledWith({ modo: 'pago', lado: 'proveedor', q: 'Altavista', contraparte: CONTRAPARTE, soloPendientes: false, page: 2, pageSize: 10 })
  })

  it('un error de la base no expone su mensaje', async () => {
    mocks.cargarMock.mockRejectedValueOnce(new Error('PGRST: detalle técnico'))
    const res = await GET(req('?modo=renglones'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('PGRST')
  })
})
