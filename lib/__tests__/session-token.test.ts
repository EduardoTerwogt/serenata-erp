import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => null) }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))

import { getToken } from 'next-auth/jwt'
import { getNodeSessionToken } from '@/lib/session-token'

describe('session-token: secreto de sesión', () => {
  const original = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET }

  beforeEach(() => {
    vi.mocked(getToken).mockClear()
  })

  afterEach(() => {
    process.env.AUTH_SECRET = original.AUTH_SECRET
    process.env.NEXTAUTH_SECRET = original.NEXTAUTH_SECRET
    if (original.AUTH_SECRET === undefined) delete process.env.AUTH_SECRET
    if (original.NEXTAUTH_SECRET === undefined) delete process.env.NEXTAUTH_SECRET
  })

  it('falla explícito sin AUTH_SECRET aunque exista NEXTAUTH_SECRET (sin fallback)', async () => {
    delete process.env.AUTH_SECRET
    process.env.NEXTAUTH_SECRET = 'legacy-secret'
    await expect(getNodeSessionToken()).rejects.toThrow('Falta AUTH_SECRET')
    expect(getToken).not.toHaveBeenCalled()
  })

  it('verifica con AUTH_SECRET', async () => {
    process.env.AUTH_SECRET = 'canonical-secret'
    process.env.NEXTAUTH_SECRET = 'legacy-secret'
    await getNodeSessionToken()
    expect(getToken).toHaveBeenCalledWith(expect.objectContaining({ secret: 'canonical-secret' }))
  })
})
