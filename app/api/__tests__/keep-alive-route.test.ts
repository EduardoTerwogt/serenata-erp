import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkDriveAuthMock: vi.fn(),
  limitMock: vi.fn(),
  deleteMock: vi.fn(),
  notMock: vi.fn(),
  ltMock: vi.fn(),
}))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'idempotency_keys') {
        return { delete: mocks.deleteMock }
      }
      return {
        select: () => ({
          limit: mocks.limitMock,
        }),
      }
    },
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
    process.env.CRON_SECRET = 'secreto-real'
    const response = await GET(buildRequest('Bearer otro-valor'))
    expect(response.status).toBe(401)
  })

  it('retorna 200 con el header correcto y CRON_SECRET configurado', async () => {
    process.env.CRON_SECRET = 'secreto-real'
    const response = await GET(buildRequest('Bearer secreto-real'))
    expect(response.status).toBe(200)
  })

  it('1E-1 -- borra idempotency_keys solo completadas (status_code no NULL) con más de 7 días', async () => {
    process.env.CRON_SECRET = 'secreto-real'
    mocks.ltMock.mockResolvedValue({ error: null, count: 3 })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(mocks.deleteMock).toHaveBeenCalledWith({ count: 'exact' })
    expect(mocks.notMock).toHaveBeenCalledWith('status_code', 'is', null)
    expect(mocks.ltMock).toHaveBeenCalledTimes(1)
    expect(body.idempotency_keys_deleted).toBe(3)
  })

  it('1E-1 -- un fallo en la limpieza de idempotency_keys no tumba el keep-alive', async () => {
    process.env.CRON_SECRET = 'secreto-real'
    mocks.ltMock.mockResolvedValue({ error: { message: 'boom' }, count: null })

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
  })
})
