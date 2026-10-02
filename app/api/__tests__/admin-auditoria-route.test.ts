import { beforeEach, describe, expect, it, vi } from 'vitest'

// B7 (F9): `auditar_consistencia()` se prueba contra la BD en el job `live` y en las
// guardas; aquí: permisos y que una respuesta rota nunca se lea como "todo en orden".
const mocks = vi.hoisted(() => ({ requireSectionMock: vi.fn(), rpcMock: vi.fn() }))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { GET } from '../admin/auditoria/route'

const resultado = {
  ejecutado_en: '2026-10-02T09:00:00Z',
  total_violaciones: 1,
  guardas: [
    { clave: 'cp_sin_grupo', descripcion: 'cuenta por pagar con proveedor y sin grupo', violaciones: 1, ejemplos: ['abc'] },
    { clave: 'folio_cc', descripcion: 'folio de cuenta por cobrar nulo o duplicado', violaciones: 0, ejemplos: [] },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockResolvedValue({ data: resultado, error: null })
})

describe('GET /api/admin/auditoria', () => {
  it('exige la sección admin y no toca la BD sin ella', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    expect((await GET()).status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('admin')
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('devuelve el resultado de auditar_consistencia', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(resultado)
    expect(mocks.rpcMock).toHaveBeenCalledWith('auditar_consistencia')
  })

  it('un error de la BD responde 500 sin exponer el detalle', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'boom interno' } })
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('boom')
  })

  it('una respuesta vacía o con otra forma es un error, no "todo en orden"', async () => {
    for (const data of [null, {}, { total_violaciones: 0 }, { ejecutado_en: 'x', total_violaciones: 0, guardas: 'no' }]) {
      mocks.rpcMock.mockResolvedValue({ data, error: null })
      expect((await GET()).status).toBe(500)
    }
  })
})
