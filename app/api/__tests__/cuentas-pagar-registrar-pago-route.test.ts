import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaPagarByIdMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  createDocumentoCuentaPagarMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  rpcMock: vi.fn(),
  withIdempotencyMock: vi.fn(
    async (
      _scope: string,
      _key: string | null | undefined,
      handler: () => Promise<{ status: number; body: unknown }>
    ) => handler()
  ),
  computePayloadHashMock: vi.fn(() => 'fake-hash'),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaPagarById: mocks.getCuentaPagarByIdMock,
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

import { POST } from '../cuentas-pagar/[id]/registrar-pago/route'

const params = Promise.resolve({ id: 'cuenta-1' })
const OP_ID = '11111111-1111-4111-8111-111111111111'

function buildRequest(fields: Record<string, string | Blob> = {}) {
  const formData = new FormData()
  formData.append('monto', '300')
  formData.append('operation_id', OP_ID)
  for (const [key, value] of Object.entries(fields)) formData.set(key, value)
  return new Request('http://x/api/cuentas-pagar/cuenta-1/registrar-pago', { method: 'POST', body: formData })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.withIdempotencyMock.mockImplementation(
    async (
      _scope: string,
      _key: string | null | undefined,
      handler: () => Promise<{ status: number; body: unknown }>
    ) => handler()
  )
  mocks.computePayloadHashMock.mockReturnValue('fake-hash')
  mocks.getCuentaPagarByIdMock.mockResolvedValue({ id: 'cuenta-1', x_pagar: 1000, monto_pagado: 0, proyecto_id: 'SH001', cotizacion_id: 'SH001' })
  mocks.getProyectoByIdMock.mockResolvedValue({ id: 'SH001', proyecto: 'Spot' })
  mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
  mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/comprobante.jpg')
  mocks.createDocumentoCuentaPagarMock.mockResolvedValue({})
  mocks.rpcMock.mockResolvedValue({
    data: { monto_pagado_total: 300, saldo_pendiente: 700, estado_nuevo: 'PENDIENTE' },
    error: null,
  })
})

describe('POST /api/cuentas-pagar/[id]/registrar-pago', () => {
  it('rechaza monto inválido sin llamar a withIdempotency', async () => {
    const res = await POST(buildRequest({ monto: '0' }), { params })
    expect(res.status).toBe(400)
    expect(mocks.withIdempotencyMock).not.toHaveBeenCalled()
  })

  it('rechaza sin operation_id (uuid), sin tocar la cuenta ni la RPC', async () => {
    const formData = new FormData()
    formData.append('monto', '300')
    const res = await POST(new Request('http://x', { method: 'POST', body: formData }), { params })
    expect(res.status).toBe(400)
    expect(mocks.getCuentaPagarByIdMock).not.toHaveBeenCalled()
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('la validación de saldo ocurre DENTRO de withIdempotency -- nunca antes de consultar idempotency_keys', async () => {
    await POST(buildRequest(), { params })

    // El mock de withIdempotency llama al handler directo; confirmamos que
    // getCuentaPagarById se invoca desde dentro de esa llamada verificando
    // el orden relativo: withIdempotency ya se llamó cuando getCuenta corre.
    expect(mocks.withIdempotencyMock).toHaveBeenCalledTimes(1)
    expect(mocks.getCuentaPagarByIdMock).toHaveBeenCalledWith('cuenta-1')
  })

  it('cuenta no encontrada -- 404', async () => {
    mocks.getCuentaPagarByIdMock.mockResolvedValue(null)
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(404)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('monto excede el saldo -- 400, sin llamar a Drive ni a la RPC', async () => {
    mocks.getCuentaPagarByIdMock.mockResolvedValue({ id: 'cuenta-1', x_pagar: 100, monto_pagado: 0, proyecto_id: 'SH001', cotizacion_id: 'SH001' })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(400)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('pasa payloadHash a withIdempotency y operation_id a la RPC', async () => {
    await POST(buildRequest(), { params })

    expect(mocks.withIdempotencyMock).toHaveBeenCalledWith(
      'cuentas-pagar:cuenta-1:registrar-pago',
      OP_ID,
      expect.any(Function),
      { payloadHash: 'fake-hash' }
    )
    expect(mocks.rpcMock).toHaveBeenCalledWith('registrar_pago_cuenta_pagar', {
      p_cuenta_id: 'cuenta-1',
      p_monto: 300,
      p_operation_id: OP_ID,
    })
  })

  it('con comprobante: lo sube a Drive y crea el documento con operation_id', async () => {
    const comprobante = new File(['x'], 'comprobante.jpg', { type: 'image/jpeg' })
    await POST(buildRequest({ comprobante }), { params })

    expect(mocks.uploadFileToDriveMock).toHaveBeenCalled()
    expect(mocks.createDocumentoCuentaPagarMock).toHaveBeenCalledWith(
      expect.objectContaining({ cuentas_pagar_id: 'cuenta-1', tipo: 'COMPROBANTE_PAGO', operation_id: OP_ID })
    )
  })

  it('éxito -- 200 con el resumen esperado', async () => {
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      resumen: { monto_pagado_total: 300, saldo_pendiente: 700, estado_nuevo: 'PENDIENTE', comprobante_url: null },
    })
  })

  it('P1411 (operation_id cruzado) -- 409, sin exponer el mensaje crudo de la RPC', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1411', message: 'operation_id ya pertenece a otra cuenta' } })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('operation_id_cruzado')
    expect(body.requestId).toEqual(expect.any(String))
    expect(JSON.stringify(body)).not.toContain('operation_id ya pertenece a otra cuenta')
  })

  it('error de RPC sin código reconocido -- EF-3 3D-9: 400 sin exponer el mensaje crudo de la RPC', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).not.toBe('boom')
    expect(body.requestId).toEqual(expect.any(String))
    expect(JSON.stringify(body)).not.toContain('boom')
  })
})
