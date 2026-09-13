import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: { rpc: mocks.rpcMock },
}))

import { checkRateLimit, getClientIp } from '../rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('llama a la RPC check_rate_limit con los parámetros correctos', async () => {
    mocks.rpcMock.mockResolvedValue({ data: true, error: null })
    await checkRateLimit('scope:key', 5, 900)
    expect(mocks.rpcMock).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'scope:key',
      p_max_attempts: 5,
      p_window_seconds: 900,
    })
  })

  it('retorna true cuando la RPC dice que está permitido', async () => {
    mocks.rpcMock.mockResolvedValue({ data: true, error: null })
    expect(await checkRateLimit('k', 5, 900)).toBe(true)
  })

  it('retorna false cuando la RPC dice que se excedió el límite', async () => {
    mocks.rpcMock.mockResolvedValue({ data: false, error: null })
    expect(await checkRateLimit('k', 5, 900)).toBe(false)
  })

  it('Fase 2.4 -- falla CERRADO (false) si la RPC truena, nunca deja pasar todo', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: new Error('conexión perdida') })
    expect(await checkRateLimit('k', 5, 900)).toBe(false)
  })
})

describe('getClientIp', () => {
  it('usa x-forwarded-for, tomando la primera IP de la lista', () => {
    const req = new Request('http://localhost', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('cae a x-real-ip si no hay x-forwarded-for', () => {
    const req = new Request('http://localhost', { headers: { 'x-real-ip': '9.9.9.9' } })
    expect(getClientIp(req)).toBe('9.9.9.9')
  })

  it('retorna "unknown" sin ningún header', () => {
    const req = new Request('http://localhost')
    expect(getClientIp(req)).toBe('unknown')
  })
})
