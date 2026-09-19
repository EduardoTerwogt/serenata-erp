import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hashPasswordMock: vi.fn(),
  crearProveedorDesdeSignupMock: vi.fn(),
  getProveedorByCorreoMock: vi.fn(),
  setPortalSessionCookieMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/auth-utils', () => ({
  hashPassword: mocks.hashPasswordMock,
}))

vi.mock('@/lib/db', () => ({
  crearProveedorDesdeSignup: mocks.crearProveedorDesdeSignupMock,
  getProveedorByCorreo: mocks.getProveedorByCorreoMock,
}))

vi.mock('@/lib/portal-auth', () => ({
  setPortalSessionCookie: mocks.setPortalSessionCookieMock,
}))

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimitMock,
  getClientIp: () => '127.0.0.1',
}))

import { POST } from '../portal/signup/route'

function req(body: unknown) {
  return new Request('http://localhost/api/portal/signup', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/portal/signup', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.getProveedorByCorreoMock.mockResolvedValue(null)
    mocks.hashPasswordMock.mockResolvedValue('hash123')
    mocks.crearProveedorDesdeSignupMock.mockResolvedValue({ id: 'prov-1', nombre: 'Chok', session_version: 0 })
    mocks.checkRateLimitMock.mockResolvedValue(true)
  })

  it('Fase 2.4 -- 429 si se excede el rate limit por IP', async () => {
    mocks.checkRateLimitMock.mockResolvedValueOnce(false)
    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))
    expect(response.status).toBe(429)
    expect(mocks.crearProveedorDesdeSignupMock).not.toHaveBeenCalled()
  })

  it('retorna 400 con correo inválido', async () => {
    const response = await POST(req({ correo: 'no-es-correo', password: 'password123' }))
    expect(response.status).toBe(400)
    expect(mocks.crearProveedorDesdeSignupMock).not.toHaveBeenCalled()
  })

  it('retorna 400 con password menor a 8 caracteres', async () => {
    const response = await POST(req({ correo: 'jose@correo.com', password: 'corto' }))
    expect(response.status).toBe(400)
  })

  it('retorna 409 si ya existe una cuenta de portal con ese correo', async () => {
    mocks.getProveedorByCorreoMock.mockResolvedValue({ id: 'existente' })
    const response = await POST(req({ correo: 'jose@correo.com', password: 'password123' }))
    expect(response.status).toBe(409)
  })

  it('crea la cuenta con el nombre tal cual cuando se proporciona, sin alias', async () => {
    const response = await POST(req({ nombre: 'Chok', correo: 'jose@correo.com', password: 'password123' }))

    expect(response.status).toBe(200)
    expect(mocks.crearProveedorDesdeSignupMock).toHaveBeenCalledWith({
      nombre: 'Chok',
      alias: null,
      correo: 'jose@correo.com',
      password_hash: 'hash123',
      regimen_fiscal: null,
    })
    expect(mocks.setPortalSessionCookieMock).toHaveBeenCalledWith('prov-1', 0)
  })

  it('Bloque 4a: alias es un campo propio, distinto de nombre', async () => {
    await POST(req({ nombre: 'José Ramírez', alias: 'Chok', correo: 'jose@correo.com', password: 'password123' }))

    expect(mocks.crearProveedorDesdeSignupMock).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'José Ramírez', alias: 'Chok' })
    )
  })

  it('usa el prefijo del correo como nombre cuando no se da alias', async () => {
    await POST(req({ correo: 'jose.gutierrez@correo.com', password: 'password123' }))

    expect(mocks.crearProveedorDesdeSignupMock).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'jose.gutierrez' })
    )
  })

  it('no sube ni pide documentos -- el signup es solo correo/password/alias', async () => {
    const response = await POST(req({ nombre: 'Chok', correo: 'jose@correo.com', password: 'password123' }))
    const body = await response.json()
    expect(body).toEqual({ success: true })
  })

  it('EF-3 3D-10: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    mocks.crearProveedorDesdeSignupMock.mockRejectedValue(new Error('duplicate key value violates unique constraint'))
    const response = await POST(req({ nombre: 'Chok', correo: 'jose@correo.com', password: 'password123' }))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('duplicate key')
    expect(body.requestId).toEqual(expect.any(String))
  })
})
