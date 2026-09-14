import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnySectionMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireAnySection: mocks.requireAnySectionMock,
}))

vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { GET } from '../proveedores/documentos-resumen/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAnySectionMock.mockResolvedValue({ response: null })
})

// EF-3 3B-12: el conteo ya no se calcula en Node cruzando getProveedores()
// con getAllProveedorDocumentos() -- delega a la RPC única
// proveedor_documentos_resumen. Las aserciones sobre el resultado final
// ({incompleta, conErrores}) no cambian frente a la versión anterior de
// este archivo; lo que cambia es qué se mockea (la RPC en vez de los dos
// repositorios). La paridad real del cálculo (incluidos los casos de
// documentos duplicados del mismo tipo) se verificó en vivo contra
// serenata-erp-test, documentada en el PR.
describe('GET /api/proveedores/documentos-resumen', () => {
  it('requiere la sección responsables o cotizaciones', async () => {
    const denyResponse = Response.json({ error: 'no autorizado' }, { status: 403 })
    mocks.requireAnySectionMock.mockResolvedValueOnce({ response: denyResponse })

    const res = await GET()

    expect(res.status).toBe(403)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('no cuenta a proveedores sin registrar en el portal', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { incompleta: 0, conErrores: 0 }, error: null })

    const res = await GET()
    const data = await res.json()
    expect(mocks.rpcMock).toHaveBeenCalledWith('proveedor_documentos_resumen')
    expect(data).toEqual({ incompleta: 0, conErrores: 0 })
  })

  it('marca incompleta cuando faltan tipos de documento requeridos', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { incompleta: 1, conErrores: 0 }, error: null })

    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ incompleta: 1, conErrores: 0 })
  })

  it('marca con errores cuando algún documento está en revisión, aunque esté completa', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { incompleta: 0, conErrores: 1 }, error: null })

    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ incompleta: 0, conErrores: 1 })
  })

  it('un proveedor completo y sin errores no cuenta en ningún lado', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { incompleta: 0, conErrores: 0 }, error: null })

    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ incompleta: 0, conErrores: 0 })
  })

  it('responde 500 sin exponer el error interno si la RPC falla', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const res = await GET()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('db down')
  })
})
