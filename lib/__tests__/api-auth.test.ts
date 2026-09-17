import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getNodeSessionTokenMock: vi.fn(),
  getUsuarioSessionStateMock: vi.fn(),
}))

// F28: `requireAuthenticated()` ya no llama a `auth()` -- decodifica el JWT
// vía `getNodeSessionToken()` (lib/session-token.ts) para no reemitir el
// cookie de sesión en cada request de API. El mock refleja el shape crudo
// del token (snake_case, `sub` en vez de `id`), no el `Session` que
// construye `requireAuthenticated()` a partir de él.
vi.mock('@/lib/session-token', () => ({
  getNodeSessionToken: mocks.getNodeSessionTokenMock,
}))
vi.mock('@/lib/server/repositories/usuarios', () => ({
  getUsuarioSessionState: mocks.getUsuarioSessionStateMock,
}))

import { requireAnySection, requireAuthenticated, requireSection } from '../api-auth'

function buildToken(overrides: { sub: string; sections?: string[]; session_version?: number }) {
  return { sub: overrides.sub, sections: overrides.sections ?? [], session_version: overrides.session_version }
}

describe('api-auth guards', () => {
  beforeEach(() => {
    mocks.getNodeSessionTokenMock.mockReset()
    mocks.getUsuarioSessionStateMock.mockReset()
  })

  it('requireAuthenticated: retorna 401 cuando no hay token', async () => {
    mocks.getNodeSessionTokenMock.mockResolvedValue(null)

    const result = await requireAuthenticated()

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toEqual({ error: 'No autenticado' })
    expect(mocks.getUsuarioSessionStateMock).not.toHaveBeenCalled()
  })

  it('requireAuthenticated: token sin `sub` -> 401, no consulta Postgres', async () => {
    mocks.getNodeSessionTokenMock.mockResolvedValue({ sections: ['cotizaciones'] })

    const result = await requireAuthenticated()

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(401)
    expect(mocks.getUsuarioSessionStateMock).not.toHaveBeenCalled()
  })

  it('requireAuthenticated: token válido y vigente -> retorna la sesión sin exigir ninguna sección', async () => {
    mocks.getNodeSessionTokenMock.mockResolvedValue(buildToken({ sub: 'u1', session_version: 0 }))
    mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: true, session_version: 0 })

    const result = await requireAuthenticated()

    expect(result.response).toBeNull()
    expect(result.session?.user).toMatchObject({ id: 'u1', sections: [], sessionVersion: 0 })
  })

  // EF-2 1B-2b: comprobación de revocación de sesión de staff -- todo token
  // real trae `sub` (NextAuth lo fija en el jwt callback a partir del `id`
  // que devuelve `authorize()`), así que `getUsuarioSessionState` siempre se
  // consulta una vez pasado el chequeo de arriba.
  describe('requireAuthenticated: revocación de sesión (session_version)', () => {
    it('usuario desactivado -> 401 "Sesión invalidada", nunca deja pasar', async () => {
      mocks.getNodeSessionTokenMock.mockResolvedValue(buildToken({ sub: 'u1', session_version: 2, sections: ['cotizaciones'] }))
      mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: false, session_version: 2 })

      const result = await requireAuthenticated()

      expect(result.session).toBeNull()
      expect(result.response?.status).toBe(401)
      const body = await result.response!.json() as { error: string; requestId: string }
      expect(body.error).toBe('Sesión invalidada')
      expect(typeof body.requestId).toBe('string')
    })

    it('session_version del token no coincide con la fila real (sections/email/password_hash cambiados) -> 401, nunca "adopta en caliente"', async () => {
      mocks.getNodeSessionTokenMock.mockResolvedValue(buildToken({ sub: 'u1', session_version: 2, sections: ['cotizaciones'] }))
      // La fila real ya tiene session_version=3 (alguien la cambió vía
      // admin_update_usuario desde otra sesión admin) -- el token sigue en 2.
      mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: true, session_version: 3 })

      const result = await requireAuthenticated()

      expect(result.session).toBeNull()
      expect(result.response?.status).toBe(401)
      const body = await result.response!.json() as { error: string }
      expect(body.error).toBe('Sesión invalidada')
    })

    it('todo vigente (active=true, misma session_version) -> sin cambios de comportamiento', async () => {
      mocks.getNodeSessionTokenMock.mockResolvedValue(buildToken({ sub: 'u1', session_version: 2, sections: ['cotizaciones'] }))
      mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: true, session_version: 2 })

      const result = await requireAuthenticated()

      expect(result.response).toBeNull()
      expect(result.session?.user).toMatchObject({ id: 'u1', sessionVersion: 2, sections: ['cotizaciones'] })
    })

    it('la consulta a Postgres lanza -> 503, NUNCA se trata como sesión invalidada (no desloguea por una caída transitoria)', async () => {
      mocks.getNodeSessionTokenMock.mockResolvedValue(buildToken({ sub: 'u1', session_version: 2, sections: ['cotizaciones'] }))
      mocks.getUsuarioSessionStateMock.mockRejectedValue(new Error('ECONNRESET contra Supabase'))

      const result = await requireAuthenticated()

      expect(result.session).toBeNull()
      expect(result.response?.status).toBe(503)
      const body = await result.response!.json() as { error: string; requestId: string }
      expect(body.error).toBe('Servicio no disponible, intenta de nuevo')
      expect(body.error).not.toContain('ECONNRESET')
      expect(typeof body.requestId).toBe('string')
    })
  })

  it('retorna 401 cuando no hay token', async () => {
    mocks.getNodeSessionTokenMock.mockResolvedValue(null)

    const result = await requireSection('cotizaciones')

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('retorna 403 cuando el usuario no tiene la sección requerida', async () => {
    mocks.getNodeSessionTokenMock.mockResolvedValue(buildToken({ sub: 'u2', session_version: 0, sections: ['dashboard'] }))
    mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: true, session_version: 0 })

    const result = await requireSection('cotizaciones')

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(403)
    await expect(result.response?.json()).resolves.toEqual({ error: 'No autorizado' })
  })

  it('retorna la sesión y no genera respuesta cuando el usuario tiene acceso', async () => {
    mocks.getNodeSessionTokenMock.mockResolvedValue(buildToken({ sub: 'u3', session_version: 0, sections: ['proyectos', 'cotizaciones'] }))
    mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: true, session_version: 0 })

    const result = await requireAnySection(['responsables', 'cotizaciones'])

    expect(result.response).toBeNull()
    expect(result.session?.user).toMatchObject({ id: 'u3', sections: ['proyectos', 'cotizaciones'] })
  })
})
