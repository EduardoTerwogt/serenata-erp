import { describe, expect, it, vi } from 'vitest'
import { DomainError, buildErrorResponse } from '../domain-error'

describe('DomainError', () => {
  it('expone code, status y safeMessage', () => {
    const error = new DomainError({ code: 'usuario_no_encontrado', status: 404, safeMessage: 'Usuario no encontrado' })
    expect(error.code).toBe('usuario_no_encontrado')
    expect(error.status).toBe(404)
    expect(error.safeMessage).toBe('Usuario no encontrado')
    expect(error.message).toBe('Usuario no encontrado')
  })

  it('conserva el error original en `cause` sin exponerlo en safeMessage', () => {
    const original = new Error('detalle técnico interno, nunca debe salir')
    const error = new DomainError({ code: 'x', status: 500, safeMessage: 'Mensaje seguro', cause: original })
    expect(error.cause).toBe(original)
    expect(error.safeMessage).not.toContain('detalle técnico interno')
  })
})

describe('buildErrorResponse', () => {
  it('un DomainError responde con su safeMessage y status tal cual, más un requestId', async () => {
    const error = new DomainError({ code: 'conflicto', status: 409, safeMessage: 'Ya existe un usuario con ese correo' })

    const response = buildErrorResponse(error, 'PUT /api/admin/usuarios/[id]')
    expect(response.status).toBe(409)

    const body = await response.json() as { error: string; requestId: string }
    expect(body.error).toBe('Ya existe un usuario con ese correo')
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })

  it('cualquier otro error nunca expone su mensaje real -- responde el mensaje genérico fijo con status 500', async () => {
    const errorReal = new Error('ECONNREFUSED 127.0.0.1:5432 -- detalle interno de conexión')

    const response = buildErrorResponse(errorReal, 'GET /api/algo')
    expect(response.status).toBe(500)

    const body = await response.json() as { error: string; requestId: string }
    expect(body.error).toBe('Error interno, intenta de nuevo')
    expect(body.error).not.toContain('ECONNREFUSED')
    expect(body.error).not.toContain('5432')
    expect(typeof body.requestId).toBe('string')
  })

  it('un error que no es instancia de Error (string, objeto plano) tampoco se expone', async () => {
    const response = buildErrorResponse('un string lanzado sin querer con detalle sensible', 'GET /api/algo')
    const body = await response.json() as { error: string }
    expect(body.error).toBe('Error interno, intenta de nuevo')
  })

  it('loguea el detalle técnico real aunque el cliente nunca lo vea', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const errorReal = new Error('detalle técnico que sí debe llegar al log')

    await buildErrorResponse(errorReal, 'GET /api/algo').json()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [loggedLine] = errorSpy.mock.calls[0] as [string]
    expect(loggedLine).toContain('detalle técnico que sí debe llegar al log')
    errorSpy.mockRestore()
  })

  it('genera un requestId distinto en cada llamada', async () => {
    const a = await buildErrorResponse(new Error('a'), 'r').json() as { requestId: string }
    const b = await buildErrorResponse(new Error('b'), 'r').json() as { requestId: string }
    expect(a.requestId).not.toBe(b.requestId)
  })
})
