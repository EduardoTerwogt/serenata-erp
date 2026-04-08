import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSectionMock = vi.fn()
const getCotizacionByIdMock = vi.fn()
const buildUpdateCotizacionPayloadMock = vi.fn()
const createOrReplaceCotizacionMock = vi.fn()
const runQuotationNonCriticalAutosavesMock = vi.fn()
const validateMock = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSection: requireSectionMock,
}))

vi.mock('@/lib/db', () => ({
  getCotizacionById: getCotizacionByIdMock,
  deleteCotizacion: vi.fn(),
  deleteItemsByCotizacion: vi.fn(),
}))

vi.mock('@/lib/server/quotations/persistence', () => ({
  buildUpdateCotizacionPayload: buildUpdateCotizacionPayloadMock,
  createOrReplaceCotizacion: createOrReplaceCotizacionMock,
  runQuotationNonCriticalAutosaves: runQuotationNonCriticalAutosavesMock,
}))

vi.mock('@/lib/validation/schemas', () => ({
  CotizacionUpdateSchema: {},
  validate: validateMock,
}))

import { PUT } from '../cotizaciones/[id]/route'

describe('PUT /api/cotizaciones/[id]', () => {
  beforeEach(() => {
    requireSectionMock.mockReset()
    getCotizacionByIdMock.mockReset()
    buildUpdateCotizacionPayloadMock.mockReset()
    createOrReplaceCotizacionMock.mockReset()
    runQuotationNonCriticalAutosavesMock.mockReset()
    validateMock.mockReset()

    requireSectionMock.mockResolvedValue({ response: null })
  })

  it('actualiza la cotización y regresa el recurso refrescado', async () => {
    const previousCotizacion = {
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento viejo',
      fecha_entrega: '2026-04-10',
      locacion: 'CDMX',
      fecha_cotizacion: '2026-04-08',
      items: [],
    }

    const updatedCotizacion = {
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento nuevo',
      estado: 'BORRADOR',
    }

    getCotizacionByIdMock
      .mockResolvedValueOnce(previousCotizacion)
      .mockResolvedValueOnce(updatedCotizacion)

    validateMock.mockReturnValue({
      ok: true,
      data: {
        proyecto: 'Evento nuevo',
        items: [{ descripcion: 'Audio', precio_unitario: 1000 }],
        porcentaje_fee: 0.15,
        iva_activo: true,
        descuento_tipo: 'monto',
        descuento_valor: 0,
      },
    })

    buildUpdateCotizacionPayloadMock.mockResolvedValue({
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento nuevo',
      items: [{ descripcion: 'Audio', precio_unitario: 1000 }],
    })

    const response = await PUT(
      new Request('http://localhost/api/cotizaciones/SH001', {
        method: 'PUT',
        body: JSON.stringify({ proyecto: 'Evento nuevo' }),
      }),
      { params: Promise.resolve({ id: 'SH001' }) },
    )

    expect(buildUpdateCotizacionPayloadMock).toHaveBeenCalledWith(
      'SH001',
      previousCotizacion,
      { proyecto: 'Evento nuevo' },
      [{ descripcion: 'Audio', precio_unitario: 1000 }],
      {
        porcentaje_fee: 0.15,
        iva_activo: true,
        descuento_tipo: 'monto',
        descuento_valor: 0,
      },
    )
    expect(createOrReplaceCotizacionMock).toHaveBeenCalledWith({
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento nuevo',
      items: [{ descripcion: 'Audio', precio_unitario: 1000 }],
    })
    expect(runQuotationNonCriticalAutosavesMock).toHaveBeenCalledWith(
      'ACME',
      'Evento nuevo',
      [{ descripcion: 'Audio', precio_unitario: 1000 }],
      'PUT /api/cotizaciones/:id',
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(updatedCotizacion)
  })

  it('retorna 400 cuando la validación falla', async () => {
    getCotizacionByIdMock.mockResolvedValue({
      id: 'SH001',
      cliente: 'ACME',
      proyecto: 'Evento viejo',
      fecha_entrega: '2026-04-10',
      locacion: 'CDMX',
      fecha_cotizacion: '2026-04-08',
      items: [],
    })

    validateMock.mockReturnValue({
      ok: false,
      error: 'Payload inválido',
      details: { proyecto: ['Requerido'] },
    })

    const response = await PUT(
      new Request('http://localhost/api/cotizaciones/SH001', {
        method: 'PUT',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'SH001' }) },
    )

    expect(response.status).toBe(400)
    expect(buildUpdateCotizacionPayloadMock).not.toHaveBeenCalled()
    expect(createOrReplaceCotizacionMock).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: 'Payload inválido',
      details: { proyecto: ['Requerido'] },
    })
  })
})
