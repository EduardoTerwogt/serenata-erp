import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(),
  getCuentasPagarGruposFacturadosEventosRealizadosMock: vi.fn(),
  generarOrdenPagoMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentasPagarGruposFacturadosEventosRealizados: mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock,
  generarOrdenPago: mocks.generarOrdenPagoMock,
}))
// withIdempotency real necesita idempotency_keys: aquí solo se verifica que
// la ruta lo usa con la llave correcta y deja pasar el resultado del handler.
vi.mock('@/lib/server/idempotency', () => ({
  withIdempotency: vi.fn((_scope: string, _key: string, handler: () => Promise<unknown>) => handler()),
}))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))

import { withIdempotency } from '@/lib/server/idempotency'
import { DomainError } from '@/lib/server/errors/domain-error'
import { GET, POST } from '../cuentas-pagar/generar-orden-pago/route'

function postRequest(body?: unknown) {
  return new Request('http://localhost/api/cuentas-pagar/generar-orden-pago', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('GET/POST /api/cuentas-pagar/generar-orden-pago', () => {
  beforeEach(() => {
    mocks.requireSectionMock.mockReset()
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockReset()
    mocks.getGoogleEnvMock.mockReset()
    mocks.generarOrdenPagoMock.mockReset()
    mocks.uploadFileToDriveMock.mockReset()
    vi.mocked(withIdempotency).mockClear()
    mocks.requireSectionMock.mockResolvedValue({ response: null, session: { user: { email: 'staff@serenata.mx' } } })
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
    const res = await POST(postRequest())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toContain('Google Drive desautorizado')
    expect(JSON.stringify(body)).not.toContain('invalid_grant')
    expect(body.requestId).toEqual(expect.any(String))
  })

  it('EF-3 3D-9 (POST): otro error inesperado -- 500 genérico, sin "details" con el mensaje crudo', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockRejectedValue(new Error('boom inesperado'))
    const res = await POST(postRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.details).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('boom inesperado')
    expect(body.requestId).toEqual(expect.any(String))
  })

  const cuentas = [
    { id: 'cuenta-1', grupo_id: 'grupo-a', responsable_id: 'prov-1', responsable_nombre: 'Prov 1', cotizacion_id: 'SH001', x_pagar: 100, monto_pagado: 0, cantidad: 1, item_descripcion: 'Item 1' },
    { id: 'cuenta-2', grupo_id: 'grupo-a', responsable_id: 'prov-1', responsable_nombre: 'Prov 1', cotizacion_id: 'SH001', x_pagar: 50, monto_pagado: 0, cantidad: 1, item_descripcion: 'Item 2' },
    { id: 'cuenta-3', grupo_id: 'grupo-b', responsable_id: 'prov-2', responsable_nombre: 'Prov 2', cotizacion_id: 'SH002', x_pagar: 200, monto_pagado: 50, cantidad: 1, item_descripcion: 'Item 3' },
    { id: 'suelta-1', grupo_id: null, responsable_id: 'prov-3', responsable_nombre: 'Prov 3', cotizacion_id: 'SH003', x_pagar: 80, monto_pagado: 0, cantidad: 1, item_descripcion: 'Item 4' },
  ]

  it('B1b (POST éxito): una sola llamada a la RPC atómica con un candidato por grupo y por suelta, en saldo', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockResolvedValue(cuentas)
    mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
    mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/orden.pdf')
    mocks.generarOrdenPagoMock.mockResolvedValue({ orden_pago_id: 'orden-1', total_monto: 380, grupos: 2, cuentas: 1 })

    const res = await POST(postRequest())

    expect(res.status).toBe(200)
    expect(mocks.generarOrdenPagoMock).toHaveBeenCalledTimes(1)
    const params = mocks.generarOrdenPagoMock.mock.calls[0][0]
    expect(params.candidatos).toEqual([
      { tipo: 'grupo', id: 'grupo-a', monto_esperado: 150 },
      { tipo: 'grupo', id: 'grupo-b', monto_esperado: 150 },
      { tipo: 'cuenta', id: 'suelta-1', monto_esperado: 80 },
    ])
    expect(params.pdfUrl).toBe('https://drive/orden.pdf')
    expect(params.usuario).toBe('staff@serenata.mx')
    const body = await res.json()
    expect(body.orden_pago).toMatchObject({ id: 'orden-1', total_monto: 380, pdf_url: 'https://drive/orden.pdf' })
    expect(body.orden_pago.fecha_generacion).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('B1b: usa la idempotency_key que manda el cliente', async () => {
    const key = '3f0c1b8e-2a4d-4c6e-9f10-1a2b3c4d5e6f'
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockResolvedValue([])
    await POST(postRequest({ idempotency_key: key }))
    expect(vi.mocked(withIdempotency).mock.calls[0][0]).toBe('cuentas-pagar:generar-orden-pago')
    expect(vi.mocked(withIdempotency).mock.calls[0][1]).toBe(key)
  })

  it('B1b: sin cuerpo (UI actual) genera su propia llave por petición', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockResolvedValue([])
    await POST(postRequest())
    await POST(postRequest())
    const [k1, k2] = vi.mocked(withIdempotency).mock.calls.map((call) => call[1])
    expect(k1).toMatch(/^[0-9a-f-]{36}$/)
    expect(k1).not.toBe(k2)
  })

  it('B1b: idempotency_key que no es uuid -> 400 sin tocar la base', async () => {
    const res = await POST(postRequest({ idempotency_key: 'no-es-uuid' }))
    expect(res.status).toBe(400)
    expect(mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock).not.toHaveBeenCalled()
  })

  it('B1b: sin candidatos -> 400 y no sube PDF', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockResolvedValue([])
    const res = await POST(postRequest())
    expect(res.status).toBe(400)
    expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
  })

  it('B1b: candidatos_cambiaron de la RPC -> 409 con el mensaje seguro', async () => {
    mocks.getCuentasPagarGruposFacturadosEventosRealizadosMock.mockResolvedValue(cuentas)
    mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
    mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/orden.pdf')
    mocks.generarOrdenPagoMock.mockRejectedValue(
      new DomainError({ code: 'candidatos_cambiaron', status: 409, safeMessage: 'Los saldos cambiaron.' })
    )
    const res = await POST(postRequest())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Los saldos cambiaron.')
  })

  it('B1b: otra petición con la misma llave en curso -> 409 de espera, no 500 (S9)', async () => {
    vi.mocked(withIdempotency).mockRejectedValueOnce(
      new Error('Esta operación ya se está procesando. Espera unos segundos y revisa antes de reintentar.')
    )
    const res = await POST(postRequest({ idempotency_key: '3f0c1b8e-2a4d-4c6e-9f10-1a2b3c4d5e6f' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('ya se está generando')
  })
})
