import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  idempotencyMaybeSingleMock: vi.fn(),
  pagoMaybeSingleMock: vi.fn(),
  rpcMock: vi.fn(),
  updateEqEqMock: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: mocks.rpcMock,
    from: (table: string) => {
      if (table === 'idempotency_keys') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.idempotencyMaybeSingleMock }) }) }),
          update: () => ({ eq: () => ({ eq: mocks.updateEqEqMock }) }),
        }
      }
      // #123 (T2): la operación es el operation_id de la cabecera `pagos`.
      if (table === 'pagos') {
        return { select: () => ({ eq: () => ({ maybeSingle: mocks.pagoMaybeSingleMock }) }) }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  },
}))

import { GET } from '../cuentas-cobrar/[id]/registrar-pago/estado/route'

const params = Promise.resolve({ id: 'cuenta-1' })
const OP_ID = '11111111-1111-4111-8111-111111111111'
const req = (operationId: string | null) =>
  new Request(`http://x/api/cuentas-cobrar/cuenta-1/registrar-pago/estado${operationId ? `?operation_id=${operationId}` : ''}`)

const resultadoRpc = (id: string) => ({
  pago_id: 'pago-1',
  lado: 'cobro',
  lineas: [{ cuenta_id: id, monto_pagado_total: 300, monto_pendiente: 700, estado_nuevo: 'PARCIALMENTE_PAGADO' }],
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.pagoMaybeSingleMock.mockResolvedValue({ data: null, error: null })
  mocks.rpcMock.mockResolvedValue({ data: null, error: null })
})

describe('GET /api/cuentas-cobrar/cuenta-1/registrar-pago/estado', () => {
  it('rechaza sin operation_id', async () => {
    const res = await GET(req(null), { params })
    expect(res.status).toBe(400)
  })

  it('completed: idempotency_keys ya tiene status_code', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: 200, response: { success: true } } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'completed', result: { success: true } })
    expect(mocks.pagoMaybeSingleMock).not.toHaveBeenCalled()
  })

  it('not_found: ni idempotency_keys ni pagos tienen el operation_id', async () => {
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('ambiguous: idempotency_keys pendiente, sin evidencia durable', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'ambiguous' })
  })

  it('nunca confunde lados: el operation_id es de un pago del otro lado -- not_found', async () => {
    mocks.pagoMaybeSingleMock.mockResolvedValue({ data: { id: 'pago-1', lado: 'proveedor', comprobante_url: null }, error: null })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('nunca confunde destinos: el pago existe pero no cubre este cuenta -- not_found', async () => {
    mocks.pagoMaybeSingleMock.mockResolvedValue({ data: { id: 'pago-1', lado: 'cobro', comprobante_url: null }, error: null })
    mocks.rpcMock.mockResolvedValue({ data: resultadoRpc('otro-destino'), error: null })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('completed vía pagos: reconstruye el resumen y el comprobante_url, repara idempotency_keys', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })
    mocks.pagoMaybeSingleMock.mockResolvedValue({ data: { id: 'pago-1', lado: 'cobro', comprobante_url: 'https://drive/pago.pdf' }, error: null })
    mocks.rpcMock.mockResolvedValue({ data: resultadoRpc('cuenta-1'), error: null })

    const res = await GET(req(OP_ID), { params })
    const body = await res.json()

    expect(mocks.rpcMock).toHaveBeenCalledWith('pagos_resultado', { p_pago_id: 'pago-1' })
    expect(body.status).toBe('completed')
    expect(body.result.success).toBe(true)
    expect(body.result.resumen).toEqual({ pago_id: 'pago-1', monto_pagado_total: 300, monto_pendiente: 700, estado_nuevo: 'PARCIALMENTE_PAGADO', comprobante_url: 'https://drive/pago.pdf' })
    expect(mocks.updateEqEqMock).toHaveBeenCalled()
  })

  it('completed vía pagos sin comprobante -- comprobante_url null', async () => {
    mocks.pagoMaybeSingleMock.mockResolvedValue({ data: { id: 'pago-1', lado: 'cobro', comprobante_url: null }, error: null })
    mocks.rpcMock.mockResolvedValue({ data: resultadoRpc('cuenta-1'), error: null })
    const res = await GET(req(OP_ID), { params })
    const body = await res.json()
    expect(body.result.resumen.comprobante_url).toBeNull()
  })
})
