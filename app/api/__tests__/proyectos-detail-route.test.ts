import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSectionMock = vi.fn()
const updateProyectoWithRollbackMock = vi.fn()
const validateMock = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSection: requireSectionMock,
}))

vi.mock('@/lib/server/projects/service', () => ({
  getProyectoDetalle: vi.fn(),
  updateProyectoWithRollback: updateProyectoWithRollbackMock,
}))

vi.mock('@/lib/validation/schemas', () => ({
  ProyectoUpdateSchema: {},
  validate: validateMock,
}))

import { PUT } from '../proyectos/[id]/route'

describe('PUT /api/proyectos/[id]', () => {
  beforeEach(() => {
    requireSectionMock.mockReset()
    updateProyectoWithRollbackMock.mockReset()
    validateMock.mockReset()

    requireSectionMock.mockResolvedValue({ response: null })
  })

  it('actualiza el proyecto y separa correctamente notas_por_item del resto del payload', async () => {
    validateMock.mockReturnValue({
      ok: true,
      data: {
        estado: 'FINALIZADO',
        notas: 'Proyecto terminado',
        notas_por_item: {
          'item-1': 'Entregado',
        },
      },
    })

    updateProyectoWithRollbackMock.mockResolvedValue({
      id: 'PROY-001',
      estado: 'FINALIZADO',
      notas: 'Proyecto terminado',
    })

    const response = await PUT(
      new Request('http://localhost/api/proyectos/PROY-001', {
        method: 'PUT',
        body: JSON.stringify({ estado: 'FINALIZADO' }),
      }),
      { params: Promise.resolve({ id: 'PROY-001' }) },
    )

    expect(updateProyectoWithRollbackMock).toHaveBeenCalledWith(
      'PROY-001',
      {
        estado: 'FINALIZADO',
        notas: 'Proyecto terminado',
      },
      {
        'item-1': 'Entregado',
      },
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'PROY-001',
      estado: 'FINALIZADO',
      notas: 'Proyecto terminado',
    })
  })

  it('retorna 400 cuando la validación del proyecto falla', async () => {
    validateMock.mockReturnValue({
      ok: false,
      error: 'Proyecto inválido',
      details: { estado: ['Valor no permitido'] },
    })

    const response = await PUT(
      new Request('http://localhost/api/proyectos/PROY-001', {
        method: 'PUT',
        body: JSON.stringify({ estado: 'X' }),
      }),
      { params: Promise.resolve({ id: 'PROY-001' }) },
    )

    expect(updateProyectoWithRollbackMock).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Proyecto inválido',
      details: { estado: ['Valor no permitido'] },
    })
  })
})
