import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtVerify } from 'jose'

const mocks = vi.hoisted(() => ({
  requireAuthenticatedMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireAuthenticated: mocks.requireAuthenticatedMock }))

import { GET } from '../token/route'

const SECRET = 'test-realtime-jwt-secret'

describe('GET /api/realtime/token', () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET

  beforeEach(() => {
    mocks.requireAuthenticatedMock.mockReset()
  })

  afterEach(() => {
    process.env.SUPABASE_JWT_SECRET = originalSecret
  })

  it('responde 401 cuando no hay sesión (delegado a requireAuthenticated)', async () => {
    mocks.requireAuthenticatedMock.mockResolvedValue({
      session: null,
      response: Response.json({ error: 'No autenticado' }, { status: 401 }),
    })

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('responde 500 si falta SUPABASE_JWT_SECRET', async () => {
    delete process.env.SUPABASE_JWT_SECRET
    mocks.requireAuthenticatedMock.mockResolvedValue({
      session: { user: { id: 'u1', email: 'a@b.com', sections: ['cotizaciones'] } },
      response: null,
    })

    const res = await GET()

    expect(res.status).toBe(500)
  })

  it('firma un JWT con role, sections, sub y expiración ~600s', async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET
    mocks.requireAuthenticatedMock.mockResolvedValue({
      session: { user: { id: 'user-123', email: 'staff@serenata.test', sections: ['cotizaciones', 'responsables'] } },
      response: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.expires_in).toBe(600)
    expect(typeof body.token).toBe('string')

    const { payload } = await jwtVerify(body.token, new TextEncoder().encode(SECRET))
    expect(payload.role).toBe('authenticated')
    expect(payload.sections).toEqual(['cotizaciones', 'responsables'])
    expect(payload.sub).toBe('user-123')
    expect(payload.exp).toBeDefined()
    expect(payload.iat).toBeDefined()
    expect((payload.exp as number) - (payload.iat as number)).toBe(600)
  })

  it('usa el email como sub cuando no hay id (compatibilidad con bypass/sesiones viejas)', async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET
    mocks.requireAuthenticatedMock.mockResolvedValue({
      session: { user: { email: 'sin-id@serenata.test', sections: [] } },
      response: null,
    })

    const res = await GET()
    const body = await res.json()
    const { payload } = await jwtVerify(body.token, new TextEncoder().encode(SECRET))

    expect(payload.sub).toBe('sin-id@serenata.test')
    expect(payload.sections).toEqual([])
  })
})
