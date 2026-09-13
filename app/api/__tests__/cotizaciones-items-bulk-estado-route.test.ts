import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCotizacionByIdMock: vi.fn(),
  idempotencyMaybeSingleMock: vi.fn(),
  bulkOpMaybeSingleMock: vi.fn(),
  updateEqEqMock: vi.fn(async () => ({ error: null })),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({ getCotizacionById: mocks.getCotizacionByIdMock }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'idempotency_keys') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: mocks.idempotencyMaybeSingleMock,
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: mocks.updateEqEqMock,
            }),
          }),
        }
      }
      if (table === 'bulk_import_operations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: mocks.bulkOpMaybeSingleMock,
            }),
          }),
        }
      }
      throw new Error(`tabla inesperada en el test: ${table}`)
    },
  },
}))

import { GET } from '../cotizaciones/[id]/items/bulk/estado/route'

const params = Promise.resolve({ id: 'SH001' })
const req = (operationId: string | null) =>
  new Request(
    `http://x/api/cotizaciones/SH001/items/bulk/estado${operationId ? `?operation_id=${operationId}` : ''}`
  )

const OP_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.bulkOpMaybeSingleMock.mockResolvedValue({ data: null })
  mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', items: [] })
})

describe('GET /api/cotizaciones/[id]/items/bulk/estado', () => {
  it('rechaza sin operation_id', async () => {
    const res = await GET(req(null), { params })
    expect(res.status).toBe(400)
  })

  it('completed: idempotency_keys ya tiene status_code -- retorna el response guardado, sin tocar bulk_import_operations', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({
      data: { status_code: 200, response: { cotizacion: { id: 'SH001' } } },
    })

    const res = await GET(req(OP_ID), { params })
    const body = await res.json()

    expect(body).toEqual({ status: 'completed', result: { cotizacion: { id: 'SH001' } } })
    expect(mocks.bulkOpMaybeSingleMock).not.toHaveBeenCalled()
  })

  it('not_found: ni idempotency_keys ni bulk_import_operations tienen el operation_id', async () => {
    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
  })

  it('ambiguous: idempotency_keys existe pendiente (status_code null) y no hay evidencia durable', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })

    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'ambiguous' })
  })

  it('nunca confunde cotizaciones: bulk_import_operations tiene el operation_id pero de OTRA cotización -- not_found', async () => {
    mocks.bulkOpMaybeSingleMock.mockResolvedValue({ data: { cotizacion_id: 'OTRA-COT' } })

    const res = await GET(req(OP_ID), { params })
    expect(await res.json()).toEqual({ status: 'not_found' })
    expect(mocks.getCotizacionByIdMock).not.toHaveBeenCalled()
  })

  it('completed vía bulk_import_operations: reconstruye el resultado desde la cotización actual y repara idempotency_keys si existía pendiente', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: { status_code: null, response: null } })
    mocks.bulkOpMaybeSingleMock.mockResolvedValue({ data: { cotizacion_id: 'SH001' } })
    mocks.getCotizacionByIdMock.mockResolvedValue({ id: 'SH001', items: [{ id: 'x' }] })

    const res = await GET(req(OP_ID), { params })
    const body = await res.json()

    expect(body).toEqual({ status: 'completed', result: { cotizacion: { id: 'SH001', items: [{ id: 'x' }] } } })
    expect(mocks.updateEqEqMock).toHaveBeenCalled()
  })

  it('completed vía bulk_import_operations sin fila previa en idempotency_keys: no intenta reparar', async () => {
    mocks.idempotencyMaybeSingleMock.mockResolvedValue({ data: null })
    mocks.bulkOpMaybeSingleMock.mockResolvedValue({ data: { cotizacion_id: 'SH001' } })

    await GET(req(OP_ID), { params })

    expect(mocks.updateEqEqMock).not.toHaveBeenCalled()
  })
})
