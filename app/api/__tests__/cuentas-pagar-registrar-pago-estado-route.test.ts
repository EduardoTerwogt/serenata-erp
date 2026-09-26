import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  idempotencyMaybeSingleMock: vi.fn(),
  pagoOpMaybeSingleMock: vi.fn(),
  documentoMaybeSingleMock: vi.fn(),
  pagoMaybeSingleMock: vi.fn(),
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
      if (table === 'pagos_cuentas_pagar') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.pagoMaybeSingleMock }) }) }) }
      }
      if (table === 'documentos_cuentas_pagar') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.documentoMaybeSingleMock }) }) }) }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  },
}))

import { GET } from '../cuentas-pagar/[id]/registrar-pago/estado/route'

const params = Promise.resolve({ id: 'cuenta-1' })
const OP_ID = '11111111-1111-4111-8111-111111111111'
const req = (operationId: string | null) =>
  new Request(`http://x/api/cuentas-pagar/cuenta-1/registrar-pago/estado${operationId ? `?operation_id=${operationId}` : ''}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.pagoOpMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.documentoMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.pagoMaybeSingleMock.mockResolvedValue({ data: null })
})

describe('GET /api/cuentas-pagar/[id]/registrar-pago/estado', () => {
  it('rechaza sin operation_id', async () => {
    const res = await GET(req(null), { params })
    expect(res.status).toBe(400)
  })

  it('completed: idempotency_keys ya tiene status_code', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: 200, response: { success: true } } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'completed', result: { success: true } })
    expect(mocks.pagoOpMaybeSingleMock).not.toHaveBeenCalled()
  })

  it('not_found: ni idempotency_keys ni pago_operations tienen el operation_id', async () => {
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('ambiguous: idempotency_keys pendiente, sin evidencia durable', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'ambiguous' })
  })

  it('nunca confunde cuentas: pago_operations tiene el operation_id pero de OTRA cuenta -- not_found', async () => {
    mocks.pagoOpMaybeSingleMock.mockResolvedValue({ data: { dominio: 'cuentas_pagar', cuenta_id: 'otra-cuenta', result: {} } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('nunca confunde dominios: mismo cuenta_id pero dominio cuentas_cobrar -- not_found', async () => {
    mocks.pagoOpMaybeSingleMock.mockResolvedValue({ data: { dominio: 'cuentas_cobrar', cuenta_id: 'cuenta-1', result: {} } })
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('completed vía pago_operations: reconstruye el resumen y el comprobante_url, repara idempotency_keys', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })
    mocks.pagoOpMaybeSingleMock.mockResolvedValue({
      data: { dominio: 'cuentas_pagar', cuenta_id: 'cuenta-1', result: { monto_pagado_total: 300, saldo_pendiente: 700, estado_nuevo: 'PENDIENTE' } },
    })
    mocks.documentoMaybeSingleMock.mockResolvedValue({ data: { archivo_url: 'https://drive/comprobante.jpg' } })

    const res = await GET(req(OP_ID), { params })

    expect(await res.json()).toEqual({
      status: 'completed',
      result: {
        success: true,
        resumen: { monto_pagado_total: 300, saldo_pendiente: 700, estado_nuevo: 'PENDIENTE', comprobante_url: 'https://drive/comprobante.jpg' },
      },
    })
    expect(mocks.updateEqEqMock).toHaveBeenCalled()
  })

  it('completed vía pago_operations sin comprobante -- comprobante_url null', async () => {
    mocks.pagoOpMaybeSingleMock.mockResolvedValue({
      data: { dominio: 'cuentas_pagar', cuenta_id: 'cuenta-1', result: { monto_pagado_total: 300, saldo_pendiente: 700, estado_nuevo: 'PENDIENTE' } },
    })

    const res = await GET(req(OP_ID), { params })
    const body = await res.json()
    expect(body.result.resumen.comprobante_url).toBeNull()
  })

  it('B2 (A1): el comprobante se toma del propio pago (pagos_cuentas_pagar) antes que de un documento', async () => {
    mocks.pagoOpMaybeSingleMock.mockResolvedValue({
      data: { dominio: 'cuentas_pagar', cuenta_id: 'cuenta-1', result: { monto_pagado_total: 300, saldo_pendiente: 700, estado_nuevo: 'EN_PROCESO_PAGO' } },
    })
    mocks.pagoMaybeSingleMock.mockResolvedValue({ data: { comprobante_url: 'https://drive/pago.pdf' } })
    const res = await GET(req(OP_ID), { params })
    const body = await res.json()
    expect(body.result.resumen.comprobante_url).toBe('https://drive/pago.pdf')
    expect(mocks.documentoMaybeSingleMock).not.toHaveBeenCalled()
  })
})

