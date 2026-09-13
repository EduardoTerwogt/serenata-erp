import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authMock: vi.fn(),
  getUsuarioSessionStateMock: vi.fn(),
}))

vi.mock('@/auth', () => ({
  auth: mocks.authMock,
}))
vi.mock('@/lib/server/repositories/usuarios', () => ({
  getUsuarioSessionState: mocks.getUsuarioSessionStateMock,
}))

import { requireAnySection, requireAuthenticated, requireSection } from '../api-auth'

describe('api-auth guards', () => {
  beforeEach(() => {
    mocks.authMock.mockReset()
    mocks.getUsuarioSessionStateMock.mockReset()
  })

  it('requireAuthenticated: retorna 401 cuando no hay sesión', async () => {
    mocks.authMock.mockResolvedValue(null)

    const result = await requireAuthenticated()

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('requireAuthenticated: retorna la sesión sin exigir ninguna sección', async () => {
    const session = { user: { sections: [] as string[] } }
    mocks.authMock.mockResolvedValue(session)

    const result = await requireAuthenticated()

    expect(result.response).toBeNull()
    expect(result.session).toEqual(session)
    expect(mocks.getUsuarioSessionStateMock).not.toHaveBeenCalled()
  })

  // EF-2 1B-2b: comprobación de revocación de sesión de staff -- solo se
  // dispara cuando la sesión trae `id` (todas las de arriba, sin `id`,
  // representan sesiones sintéticas/de otra forma que no participan de
  // este chequeo, y ya se confirmó que no llaman a getUsuarioSessionState).
  describe('requireAuthenticated: revocación de sesión (session_version)', () => {
    it('usuario desactivado -> 401 "Sesión invalidada", nunca deja pasar', async () => {
      const session = { user: { id: 'u1', sessionVersion: 2, sections: ['cotizaciones'] } }
      mocks.authMock.mockResolvedValue(session)
      mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: false, session_version: 2 })

      const result = await requireAuthenticated()

      expect(result.session).toBeNull()
      expect(result.response?.status).toBe(401)
      const body = await result.response!.json() as { error: string; requestId: string }
      expect(body.error).toBe('Sesión invalidada')
      expect(typeof body.requestId).toBe('string')
    })

    it('session_version del token no coincide con la fila real (sections/email/password_hash cambiados) -> 401, nunca "adopta en caliente"', async () => {
      const session = { user: { id: 'u1', sessionVersion: 2, sections: ['cotizaciones'] } }
      mocks.authMock.mockResolvedValue(session)
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
      const session = { user: { id: 'u1', sessionVersion: 2, sections: ['cotizaciones'] } }
      mocks.authMock.mockResolvedValue(session)
      mocks.getUsuarioSessionStateMock.mockResolvedValue({ active: true, session_version: 2 })

      const result = await requireAuthenticated()

      expect(result.response).toBeNull()
      expect(result.session).toEqual(session)
    })

    it('la consulta a Postgres lanza -> 503, NUNCA se trata como sesión invalidada (no desloguea por una caída transitoria)', async () => {
      const session = { user: { id: 'u1', sessionVersion: 2, sections: ['cotizaciones'] } }
      mocks.authMock.mockResolvedValue(session)
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

  it('retorna 401 cuando no hay sesión', async () => {
    mocks.authMock.mockResolvedValue(null)

    const result = await requireSection('cotizaciones')

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('retorna 403 cuando el usuario no tiene la sección requerida', async () => {
    mocks.authMock.mockResolvedValue({
      user: {
        sections: ['dashboard'],
      },
    })

    const result = await requireSection('cotizaciones')

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(403)
    await expect(result.response?.json()).resolves.toEqual({ error: 'No autorizado' })
  })

  it('retorna la sesión y no genera respuesta cuando el usuario tiene acceso', async () => {
    const session = {
      user: {
        sections: ['proyectos', 'cotizaciones'],
      },
    }

    mocks.authMock.mockResolvedValue(session)

    const result = await requireAnySection(['responsables', 'cotizaciones'])

    expect(result.response).toBeNull()
    expect(result.session).toEqual(session)
  })
})
