import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  idempotencyMaybeSingleMock: vi.fn(),
  pagoOpMaybeSingleMock: vi.fn(),
  updateEqEqMock: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'idempotency_keys') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.idempotencyMaybeSingleMock }) }) }),
          update: () => ({ eq: () => ({ eq: mocks.updateEqEqMock }) }),
        }
      }
      if (table === 'pago_operations') {
        return { select: () => ({ eq: () => ({ maybeSingle: mocks.pagoOpMaybeSingleMock }) }) }
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.pagoOpMaybeSingleMock.mockResolvedValue({ data: null })
})

describe('GET /api/cuentas-cobrar/[id]/registrar-pago/estado', () => {
  it('rechaza sin operation_id', async () => {
    const res = await GET(req(null), { params })
    expect(res.status).toBe(400)
  })

  it('completed: idempotency_keys ya tiene status_code', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: 200, response: { success: true } } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'completed', result: { success: true } })
  })

  it('not_found: sin evidencia en ninguna tabla', async () => {
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('ambiguous: idempotency_keys pendiente, sin evidencia durable', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'ambiguous' })
  })

  it('nunca confunde dominios: pago_operations tiene el operation_id pero de cuentas_pagar -- not_found', async () => {
    mocks.pagoOpMaybeSingleMock.mockResolvedValue({ data: { dominio: 'cuentas_pagar', cuenta_id: 'cuenta-1', result: {} } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('completed vía pago_operations: reconstruye el resumen y repara idempotency_keys', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })
    mocks.pagoOpMaybeSingleMock.mockResolvedValue({
      data: { dominio: 'cuentas_cobrar', cuenta_id: 'cuenta-1', result: { monto_pagado_total: 300, monto_pendiente: 700, estado_nuevo: 'PARCIALMENTE_PAGADO' } },
    })

    const res = await GET(req(OP_ID), { params })

    expect(await res.json()).toEqual({
      status: 'completed',
      result: { success: true, resumen: { monto_pagado_total: 300, monto_pendiente: 700, estado_nuevo: 'PARCIALMENTE_PAGADO' } },
    })
    expect(mocks.updateEqEqMock).toHaveBeenCalled()
  })
})
