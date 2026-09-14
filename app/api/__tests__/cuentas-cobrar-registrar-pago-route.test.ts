import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaCobrarByIdMock: vi.fn(),
  getPagosComprobantesByCuentaMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  createDocumentoCuentaCobrarMock: vi.fn(),
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
  getCuentaCobrarById: mocks.getCuentaCobrarByIdMock,
  getPagosComprobantesByCuenta: mocks.getPagosComprobantesByCuentaMock,
  getProyectoById: mocks.getProyectoByIdMock,
  createDocumentoCuentaCobrar: mocks.createDocumentoCuentaCobrarMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))
vi.mock('@/lib/server/idempotency', () => ({
  withIdempotency: mocks.withIdempotencyMock,
  computePayloadHash: mocks.computePayloadHashMock,
}))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { POST } from '../cuentas-cobrar/[id]/registrar-pago/route'

const params = Promise.resolve({ id: 'cuenta-1' })
const OP_ID = '11111111-1111-4111-8111-111111111111'

function buildRequest(fields: Record<string, string | Blob> = {}) {
  const formData = new FormData()
  formData.append('monto', '300')
  formData.append('tipo_pago', 'TRANSFERENCIA')
  formData.append('fecha_pago', '2026-09-12')
  formData.append('operation_id', OP_ID)
  for (const [key, value] of Object.entries(fields)) formData.set(key, value)
  return new Request('http://x/api/cuentas-cobrar/cuenta-1/registrar-pago', { method: 'POST', body: formData })
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
  mocks.getCuentaCobrarByIdMock.mockResolvedValue({ id: 'cuenta-1', monto_total: 1000, cotizacion_id: 'SH001' })
  mocks.getPagosComprobantesByCuentaMock.mockResolvedValue([])
  mocks.getProyectoByIdMock.mockResolvedValue({ id: 'SH001', proyecto: 'Spot' })
  mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
  mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/comprobante.jpg')
  mocks.createDocumentoCuentaCobrarMock.mockResolvedValue({})
  mocks.rpcMock.mockResolvedValue({
    data: { monto_pagado_total: 300, monto_pendiente: 700, estado_nuevo: 'PARCIALMENTE_PAGADO' },
    error: null,
  })
})

describe('POST /api/cuentas-cobrar/[id]/registrar-pago', () => {
  it('rechaza sin operation_id', async () => {
    const formData = new FormData()
    formData.append('monto', '300')
    formData.append('tipo_pago', 'TRANSFERENCIA')
    formData.append('fecha_pago', '2026-09-12')
    const res = await POST(new Request('http://x', { method: 'POST', body: formData }), { params })
    expect(res.status).toBe(400)
    expect(mocks.getCuentaCobrarByIdMock).not.toHaveBeenCalled()
  })

  it('rechaza tipo_pago inválido antes de tocar operation_id/RPC', async () => {
    const res = await POST(buildRequest({ tipo_pago: 'CHEQUE' }), { params })
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('cuenta no encontrada -- 404, sin RPC', async () => {
    mocks.getCuentaCobrarByIdMock.mockResolvedValue(null)
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(404)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('monto excede el total de la cuenta -- 400', async () => {
    mocks.getPagosComprobantesByCuentaMock.mockResolvedValue([{ monto: 900 }])
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('pasa payloadHash y operation_id correctamente', async () => {
    await POST(buildRequest(), { params })

    expect(mocks.withIdempotencyMock).toHaveBeenCalledWith(
      'cuentas-cobrar:cuenta-1:registrar-pago',
      OP_ID,
      expect.any(Function),
      { payloadHash: 'fake-hash' }
    )
    expect(mocks.rpcMock).toHaveBeenCalledWith('registrar_pago_cuenta_cobrar', {
      p_cuenta_id: 'cuenta-1',
      p_monto: 300,
      p_tipo_pago: 'TRANSFERENCIA',
      p_fecha_pago: '2026-09-12',
      p_comprobante_url: '',
      p_archivo_nombre: 'pago_2026-09-12',
      p_notas: null,
      p_operation_id: OP_ID,
    })
  })

  it('con comprobante: crea el documento con operation_id', async () => {
    const comprobante = new File(['x'], 'comprobante.jpg', { type: 'image/jpeg' })
    await POST(buildRequest({ comprobante }), { params })

    expect(mocks.createDocumentoCuentaCobrarMock).toHaveBeenCalledWith(
      expect.objectContaining({ cuentas_cobrar_id: 'cuenta-1', tipo: 'OTRO', operation_id: OP_ID })
    )
  })

  it('éxito -- 200 con el resumen esperado', async () => {
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      resumen: { monto_pagado_total: 300, monto_pendiente: 700, estado_nuevo: 'PARCIALMENTE_PAGADO' },
    })
  })

  it('P1411 (operation_id cruzado) -- 409', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { code: 'P1411', message: 'operation_id ya pertenece a otra cuenta' } })
    const res = await POST(buildRequest(), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('operation_id_cruzado')
  })
})
