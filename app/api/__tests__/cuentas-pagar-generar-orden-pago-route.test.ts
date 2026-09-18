import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCuentasPagarGruposFacturadosEventosRealizadosMock: vi.fn(),
  createOrdenPagoMock: vi.fn(),
  updateCuentasPagarGruposEnOrdenMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentasPagarGruposFacturadosEventosRealizados: mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock,
  createOrdenPago: mocks.createOrdenPagoMock,
  updateCuentasPagarGruposEnOrden: mocks.updateCuentasPagarGruposEnOrdenMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))

import { GET, POST } from '../cuentas-pagar/generar-orden-pago/route'

describe('GET/POST /api/cuentas-pagar/generar-orden-pago', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockReset()
    mocks.getGoogleEnvMock.mockReset()
    mocks.requireSectionMock.mockResolvedValue({ response: null })
  })

  it('EF-3 3D-9 (GET): un error inesperado nunca expone JSON.stringify(error) como "details"', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockRejectedValue(new Error('conexión perdida a Postgres'))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.details).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('conexión perdida a Postgres')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('EF-3 3D-9 (POST): error de Drive desautorizado -- 503 preservado, con safeMessage fijo', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockRejectedValue(new Error('invalid_grant: token revoked'))
    const res = await POST()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('Google Drive desautorizado')
    expect(JSON.stringify(body)).not.toContain('invalid_grant')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('EF-3 3D-9 (POST): otro error inesperado -- 500 genérico, sin "details" con el mensaje crudo', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockRejectedValue(new Error('boom inesperado'))
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.details).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('boom inesperado')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('Bloque 3 (POST éxito): deriva grupo_id distintos de las cuentas del preview y actualiza los grupos, no cuentas individuales', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockResolvedValue([
      { id: 'cuenta-1', grupo_id: 'grupo-a', responsable_id: 'prov-1', responsable_nombre: 'Prov 1', cotizacion_id: 'SH001', x_pagar: 100, cantidad: 1, item_descripcion: 'Item 1' },
      { id: 'cuenta-2', grupo_id: 'grupo-a', responsable_id: 'prov-1', responsable_nombre: 'Prov 1', cotizacion_id: 'SH001', x_pagar: 50, cantidad: 1, item_descripcion: 'Item 2' },
      { id: 'cuenta-3', grupo_id: 'grupo-b', responsable_id: 'prov-2', responsable_nombre: 'Prov 2', cotizacion_id: 'SH002', x_pagar: 200, cantidad: 1, item_descripcion: 'Item 3' },
    ])
    mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
    mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/orden.pdf')
    mocks.createOrdenPagoMock.mockResolvedValue({ id: 'orden-1', fecha_generacion: '2026-09-17', pdf_url: 'https://drive/orden.pdf', pdf_nombre: 'orden.pdf', total_monto: 350 })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(mocks.updateCuentasPagarGruposEnOrdenMock).toHaveBeenCalledWith(
      expect.arrayContaining(['grupo-a', 'grupo-b']),
      'orden-1'
    )
    expect(mocks.updateCuentasPagarGruposEnOrdenMock.mock.calls[0][0]).toHaveLength(2)
  })
})
