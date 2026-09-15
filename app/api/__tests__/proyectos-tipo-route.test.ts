import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EF-3 3D-11: `tipo/route.ts` ya tenía `TipoYaAsignadoError` mapeado a 409
 * con mensaje limpio, y un fallback a 500 con el error técnico crudo
 * (`JSON.stringify(error)`) para todo lo demás. Este test confirma que el
 * caso de 409 conserva exactamente su mensaje/status actual, y que el
 * fallback ahora usa `buildErrorResponse` (nunca expone el detalle
 * técnico). `lib/server/projects/tipo-assignment.ts` no se toca -- el
 * mapeo a DomainError es responsabilidad exclusiva de esta ruta.
 */

const mocks = vi.hoisted(() => {
  class TipoYaAsignadoErrorFake extends Error {
    constructor() {
      super('El proyecto ya tiene un tipo de proyecto asignado')
      this.name = 'TipoYaAsignadoError'
    }
  }
  return {
    requireSectionMock: vi.fn(async () => ({ response: null })),
    asignarTipoProyectoMock: vi.fn(),
    validateMock: vi.fn(),
    TipoYaAsignadoErrorFake,
  }
})

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/projects/tipo-assignment', () => ({
  asignarTipoProyecto: mocks.asignarTipoProyectoMock,
  TipoYaAsignadoError: mocks.TipoYaAsignadoErrorFake,
}))
vi.mock('@/lib/validation/schemas', () => ({
  ProyectoAsignarTipoSchema: {},
  validate: mocks.validateMock,
}))

import { PUT } from '../proyectos/[id]/tipo/route'
import { TipoYaAsignadoError } from '@/lib/server/projects/tipo-assignment'

const params = Promise.resolve({ id: 'proyecto-1' })

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/proyectos/proyecto-1/tipo', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('PUT /api/proyectos/[id]/tipo', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockClear()
    mocks.asignarTipoProyectoMock.mockReset()
    mocks.validateMock.mockReset()
    mocks.validateMock.mockReturnValue({ ok: true, data: { tipo_proyecto_id: 'tipo-1' } })
  })

  it('retorna 400 cuando la validación falla', async () => {
    mocks.validateMock.mockReturnValue({ ok: false, error: 'Payload inválido', details: {} })

    const response = await PUT(buildRequest({}), { params })

    expect(mocks.asignarTipoProyectoMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
  })

  it('asigna el tipo de proyecto correctamente', async () => {
    mocks.asignarTipoProyectoMock.mockResolvedValue({ id: 'proyecto-1', tipo_proyecto_id: 'tipo-1' })

    const response = await PUT(buildRequest({ tipo_proyecto_id: 'tipo-1' }), { params })

    expect(mocks.asignarTipoProyectoMock).toHaveBeenCalledWith('proyecto-1', 'tipo-1')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'proyecto-1', tipo_proyecto_id: 'tipo-1' })
  })

  it('TipoYaAsignadoError conserva exactamente su mensaje y status 409 actuales', async () => {
    mocks.asignarTipoProyectoMock.mockRejectedValueOnce(new TipoYaAsignadoError())

    const response = await PUT(buildRequest({ tipo_proyecto_id: 'tipo-1' }), { params })
    expect(response.status).toBe(409)

    const body = await response.json() as { error: string }
    expect(body.error).toBe('El proyecto ya tiene un tipo de proyecto asignado')
  })

  it('EF-3 3D-11: un error inesperado (crudo de Supabase) nunca expone su mensaje real al cliente', async () => {
    const detalleTecnico = 'null value in column "tipo_proyecto_id" violates not-null constraint'
    mocks.asignarTipoProyectoMock.mockRejectedValueOnce(new Error(detalleTecnico))

    const response = await PUT(buildRequest({ tipo_proyecto_id: 'tipo-1' }), { params })
    expect(response.status).toBe(500)

    const body = await response.json() as { error: string; requestId: string }
    expect(body.error).toBe('Error interno, intenta de nuevo')
    expect(body.error).not.toContain('tipo_proyecto_id')
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })
})
