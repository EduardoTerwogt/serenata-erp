import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaPagarGrupoByIdMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  createDocumentoCuentaPagarMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  rpcMock: vi.fn(),
  withIdempotencyMock: vi.fn(
    async (_scope: string, _key: string | null | undefined, handler: () => Promise<{ status: number; body: unknown }>) => handler()
  ),
  computePayloadHashMock: vi.fn(() => 'fake-hash'),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaPagarGrupoById: mocks.getCuentaPagarGrupoByIdMock,
  getProyectoById: mocks.getProyectoByIdMock,
  createDocumentoCuentaPagar: mocks.createDocumentoCuentaPagarMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))
vi.mock('@/lib/server/idempotency', () => ({
  withIdempotency: mocks.withIdempotencyMock,
  computePayloadHash: mocks.computePayloadHashMock,
}))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { POST } from '../cuentas-pagar/grupos/[id]/registrar-pago/route'

const params = Promise.resolve({ id: 'grupo-1' })
const OP_ID = '11111111-1111-4111-8111-111111111111'

function buildRequest(fields: Record<string, string | Blob> = {}) {
  const formData = new FormData()
  formData.append('monto', '300')
  formData.append('operation_id', OP_ID)
  for (const [key, value] of Object.entries(fields)) formData.set(key, value)
  return new Request('http://x/api/cuentas-pagar/grupos/grupo-1/registrar-pago', { method: 'POST', body: formData })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.withIdempotencyMock.mockImplementation(
    async (_scope: string, _key: string | null | undefined, handler: () => Promise<{ status: number; body: unknown }>) => handler()
  )
  mocks.computePayloadHashMock.mockReturnValue('fake-hash')
  mocks.getCuentaPagarGrupoByIdMock.mockResolvedValue({ id: 'grupo-1', monto_total: 1000, monto_pagado: 0, proyecto_id: 'SH001' })
  mocks.getProyectoByIdMock.mockResolvedValue({ id: 'SH001', proyecto: 'Spot' })
  mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
  mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/comprobante.jpg')
  mocks.createDocumentoCuentaPagarMock.mockResolvedValue({})
  mocks.rpcMock.mockResolvedValue({
    data: { monto_pagado_total: 300, saldo_pendiente: 700, estado_nuevo: 'EN_PROCESO_PAGO' },
    error: null,
  })
})

describe('POST /api/cuentas-pagar/grupos/[id]/registrar-pago', () => {
  it('rechaza monto inválido sin llamar a withIdempotency', async () => {
    const res = await POST(buildRequest({ monto: '0' }), { params })
    expect(res.status).toBe(400)
    expect(mocks.withIdempotencyMock).not.toHaveBeenCalled()
  })

  it('rechaza sin operation_id (uuid)', async () => {
    const formData = new FormData()
    formData.append('monto', '300')
    const res = await POST(new Request('http://x', { method: 'POST', body: formData }), { params })
    expect(res.status).toBe(400)
    expect(mocks.withIdempotencyMock).not.toHaveBeenCalled()
  })

  it('B2: excede el saldo por transferir del grupo -- la RPC lo rechaza, 400 con mensaje seguro', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'Monto excede el total a transferir del grupo. Total: 232.00' } })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('El monto excede el saldo por transferir.')
  })

  it('P1411 (operation_id cruzado) -- 409', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1411', message: 'operation_id ya pertenece a otro grupo' } })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('operation_id_cruzado')
  })

  it('P1413 (grupo no facturable) -- 409', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1413', message: 'grupo_no_facturable: el grupo g está en estado ABIERTO' } })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('grupo_no_facturable')
  })

  it('éxito -- 200 con resumen, llama la RPC con p_grupo_id', async () => {
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('registrar_pago_grupo_factura', expect.objectContaining({
      p_grupo_id: 'grupo-1',
      p_monto: 300,
      p_operation_id: OP_ID,
    }))
    const body = await res.json()
    expect(body.resumen.estado_nuevo).toBe('EN_PROCESO_PAGO')
  })
})
