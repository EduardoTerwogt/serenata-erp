import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getTokenMock: vi.fn(),
  consoleLogSpy: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  requireSection: mocks.requireSectionMock,
}))

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({ getToken: mocks.getTokenMock })),
    },
  },
}))

import { GET } from '../integrations/drive/callback/route'

function req(query: string) {
  return new Request(`http://localhost/api/integrations/drive/callback${query}`)
}

describe('GET /api/integrations/drive/callback', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.getTokenMock.mockReset()
    process.env.GOOGLE_CLIENT_ID = 'client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    vi.spyOn(console, 'log').mockImplementation(mocks.consoleLogSpy)
    mocks.consoleLogSpy.mockReset()
  })

  it('Fase 3.4 -- requiere sección admin, ni siquiera intenta canjear el code', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })

    const response = await GET(req('?code=abc123'))

    expect(mocks.requireSectionMock).toHaveBeenCalledWith('admin')
    expect(mocks.getTokenMock).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
  })

  it('muestra el refresh token completo en el HTML y nunca lo loguea (Fase 3.4)', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: null })
    mocks.getTokenMock.mockResolvedValue({ tokens: { refresh_token: 'un-refresh-token-secreto' } })

    const response = await GET(req('?code=abc123'))
    const body = await response.text()

    expect(body).toContain('un-refresh-token-secreto')
    expect(mocks.consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('un-refresh-token-secreto'))
    // console.log tampoco se llamó del todo con el texto que imprimía la
    // versión vieja -- confirma que el console.log se eliminó, no que solo
    // cambió el mensaje.
    const loggedRefreshToken = mocks.consoleLogSpy.mock.calls.some(args =>
      args.some(arg => typeof arg === 'string' && arg.includes('un-refresh-token-secreto'))
    )
    expect(loggedRefreshToken).toBe(false)
  })
})
