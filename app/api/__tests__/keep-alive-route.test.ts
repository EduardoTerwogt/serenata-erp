import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkDriveAuthMock: vi.fn(),
  limitMock: vi.fn(),
  deleteMock: vi.fn(),
  notMock: vi.fn(),
  ltMock: vi.fn(),
  rateLimitsDeleteMock: vi.fn(),
  rateLimitsLtMock: vi.fn(),
  rpcMock: vi.fn(),
  operationsLtMock: vi.fn(),
  operationsDeleteMock: vi.fn(),
}))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'idempotency_keys') {
        return { delete: mocks.deleteMock }
      }
      if (table === 'rate_limits') {
        return { delete: mocks.rateLimitsDeleteMock }
      }
      if (table === 'pago_operations' || table === 'bulk_import_operations') {
        return { delete: (...args: unknown[]) => mocks.operationsDeleteMock(table, ...args) }
      }
      return {
        select: () => ({
          limit: mocks.limitMock,
        }),
      }
    },
    rpc: mocks.rpcMock,
  },
}))

vi.mock('@/lib/integrations/google/drive', () => ({
  checkDriveAuth: mocks.checkDriveAuthMock,
}))

import { GET } from '../keep-alive/route'

function buildRequest(authHeader: string | null) {
  const headers = new Headers()
  if (authHeader !== null) headers.set('authorization', authHeader)
  return new Request('http://localhost/api/keep-alive', { headers })
}

describe('GET /api/keep-alive', () => {
  const originalCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    mocks.limitMock.mockReset().mockResolvedValue({ error: null })
    mocks.checkDriveAuthMock.mockReset().mockResolvedValue({ status: 'ok' })
    mocks.ltMock.mockReset().mockResolvedValue({ error: null, count: 0 })
    mocks.notMock.mockReset().mockReturnValue({ lt: mocks.ltMock })
    mocks.deleteMock.mockReset().mockReturnValue({ not: mocks.notMock })
    mocks.rateLimitsLtMock.mockReset().mockResolvedValue({ error: null, count: 0 })
    mocks.rateLimitsDeleteMock.mockReset().mockReturnValue({ lt: mocks.rateLimitsLtMock })
    mocks.rpcMock.mockReset()
    mocks.operationsLtMock.mockReset().mockResolvedValue({ error: null, count: 0 })
    mocks.operationsDeleteMock.mockReset().mockReturnValue({ lt: mocks.operationsLtMock })
    process.env.CRON_SECRET = 'secreto-real'
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret
  })

  it('1B-3 -- falla cerrado (500) si CRON_SECRET no está configurado, nunca deja pasar con "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(buildRequest('Bearer undefined'))
    expect(response.status).toBe(500)
    expect(mocks.limitMock).not.toHaveBeenCalled()
  })

  it('retorna 401 si el header no coincide con CRON_SECRET configurado', async () => {
    const response = await GET(buildRequest('Bearer otro-valor'))
    expect(response.status).toBe(401)
  })

  it('retorna 200 con el header correcto y CRON_SECRET configurado', async () => {
    const response = await GET(buildRequest('Bearer secreto-real'))
    expect(response.status).toBe(200)
  })

  it('1E-1 -- borra idempotency_keys solo completadas (status_code no NULL) con más de 7 días', async () => {
    mocks.ltMock.mockResolvedValue({ error: null, count: 3 })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(mocks.deleteMock).toHaveBeenCalledWith({ count: 'exact' })
    expect(mocks.notMock).toHaveBeenCalledWith('status_code', 'is', null)
    expect(mocks.ltMock).toHaveBeenCalledTimes(1)
    expect(body.idempotency_keys_deleted).toBe(3)
  })

  it('1E-1 -- un fallo en la limpieza de idempotency_keys no tumba el keep-alive', async () => {
    mocks.ltMock.mockResolvedValue({ error: { message: 'boom' }, count: null })

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
  })

  it('EF-3 3C-4 -- borra solo rate_limits con window_start de más de 24h', async () => {
    mocks.rateLimitsLtMock.mockResolvedValue({ error: null, count: 5 })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(mocks.rateLimitsDeleteMock).toHaveBeenCalledWith({ count: 'exact' })
    expect(mocks.rateLimitsLtMock).toHaveBeenCalledTimes(1)
    expect(body.rate_limits_deleted).toBe(5)
  })

  it('EF-3 3C-4 -- un fallo en la limpieza de rate_limits no tumba el keep-alive', async () => {
    mocks.rateLimitsLtMock.mockResolvedValue({ error: { message: 'boom' }, count: null })

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
  })

  it('D15 -- ya no llama la RPC de estados vencidos (el estado del cobro es derivado)', async () => {
    const body = await (await GET(buildRequest('Bearer secreto-real'))).json()

    expect(mocks.rpcMock).not.toHaveBeenCalled()
    expect(body).not.toHaveProperty('cuentas_cobrar_sync')
  })

  it('PLAN B3 (K2) -- borra pago_operations y bulk_import_operations de más de 30 días', async () => {
    mocks.operationsLtMock.mockResolvedValue({ error: null, count: 4 })

    const body = await (await GET(buildRequest('Bearer secreto-real'))).json()

    expect(mocks.operationsDeleteMock).toHaveBeenCalledWith('pago_operations', { count: 'exact' })
    expect(mocks.operationsDeleteMock).toHaveBeenCalledWith('bulk_import_operations', { count: 'exact' })
    const [columna, corte] = mocks.operationsLtMock.mock.calls[0]
    expect(columna).toBe('created_at')
    const dias = (Date.now() - new Date(corte as string).getTime()) / (24 * 60 * 60 * 1000)
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThan(30.1)
    expect(body.pago_operations_deleted).toBe(4)
    expect(body.bulk_import_operations_deleted).toBe(4)
  })

  it('PLAN B3 (K2) -- un fallo al purgar operaciones no tumba el keep-alive ni la otra tabla', async () => {
    mocks.operationsLtMock
      .mockResolvedValueOnce({ error: { message: 'boom' }, count: null })
      .mockResolvedValueOnce({ error: null, count: 2 })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.pago_operations_deleted).toBeNull()
    expect(body.bulk_import_operations_deleted).toBe(2)
  })
})
