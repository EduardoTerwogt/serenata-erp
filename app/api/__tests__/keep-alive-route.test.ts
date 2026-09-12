import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkDriveAuthMock: vi.fn(),
  limitMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        limit: mocks.limitMock,
      }),
    }),
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
})
