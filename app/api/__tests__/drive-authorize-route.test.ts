import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getAuthorizationUrlMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('@/lib/integrations/google/auth', () => ({
  getAuthorizationUrl: mocks.getAuthorizationUrlMock,
}))

import { GET } from '../integrations/drive/authorize/route'

describe('GET /api/integrations/drive/authorize', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.getAuthorizationUrlMock.mockReset()
  })

  it('Fase 3.4 -- requiere sección admin, no queda abierta a cualquier sesión', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })

    const response = await GET()

    expect(mocks.requireSectionMock).toHaveBeenCalledWith('admin')
    expect(mocks.getAuthorizationUrlMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
  })

  it('redirige a Google cuando es admin y hay credenciales configuradas', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.getAuthorizationUrlMock.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?...')

    const response = await GET()

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('accounts.google.com')
  })
})
