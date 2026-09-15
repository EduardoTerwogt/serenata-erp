import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCuentasPagarPendientesEventosRealizadosMock: vi.fn(),
  createOrdenPagoMock: vi.fn(),
  updateCuentasPagarEnOrdenMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentasPagarPendientesEventosRealizados: mocks.getCuentasPagarPendientesEventosRealizadosMock,
  createOrdenPago: mocks.createOrdenPagoMock,
  updateCuentasPagarEnOrden: mocks.updateCuentasPagarEnOrdenMock,
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))

import { GET, POST } from '../cuentas-pagar/generar-orden-pago/route'

describe('GET/POST /api/cuentas-pagar/generar-orden-pago', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.getCuentasPagarPendientesEventosRealizadosMock.mockReset()
    mocks.getGoogleEnvMock.mockReset()
    mocks.requireSectionMock.mockResolvedValue({ response: null })
  })

  it('EF-3 3D-9 (GET): un error inesperado nunca expone JSON.stringify(error) como "details"', async () => {
    mocks.getCuentasPagarPendientesEventosRealizadosMock.mockRejectedValue(new Error('conexión perdida a Postgres'))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.details).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('conexión perdida a Postgres')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('EF-3 3D-9 (POST): error de Drive desautorizado -- 503 preservado, con safeMessage fijo', async () => {
    mocks.getCuentasPagarPendientesEventosRealizadosMock.mockRejectedValue(new Error('invalid_grant: token revoked'))
    const res = await POST()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('Google Drive desautorizado')
    expect(JSON.stringify(body)).not.toContain('invalid_grant')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('EF-3 3D-9 (POST): otro error inesperado -- 500 genérico, sin "details" con el mensaje crudo', async () => {
    mocks.getCuentasPagarPendientesEventosRealizadosMock.mockRejectedValue(new Error('boom inesperado'))
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.details).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('boom inesperado')
    expect(body.requestId).toEqual(expect.any(String))
  })
})
