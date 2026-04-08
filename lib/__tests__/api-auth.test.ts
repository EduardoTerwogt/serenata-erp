import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()

vi.mock('@/auth', () => ({
  auth: authMock,
}))

import { requireAnySection, requireSection } from '../api-auth'

describe('api-auth guards', () => {
  beforeEach(() => {
    authMock.mockReset()
  })

  it('retorna 401 cuando no hay sesión', async () => {
    authMock.mockResolvedValue(null)

    const result = await requireSection('cotizaciones')

    expect(result.session).toBeNull()
    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toEqual({ error: 'No autenticado' })
  })

  it('retorna 403 cuando el usuario no tiene la sección requerida', async () => {
    authMock.mockResolvedValue({
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

    authMock.mockResolvedValue(session)

    const result = await requireAnySection(['responsables', 'cotizaciones'])

    expect(result.response).toBeNull()
    expect(result.session).toEqual(session)
  })
})
