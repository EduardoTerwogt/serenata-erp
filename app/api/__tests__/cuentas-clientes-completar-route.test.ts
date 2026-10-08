import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async (_s: string) => ({ response: null as Response | null })),
  completarMock: vi.fn(),
  driveEnv: { current: { driveFolderIdCuentas: 'folder' } as { driveFolderIdCuentas: string } | null },
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: () => mocks.driveEnv.current }))
vi.mock('@/lib/server/cuentas/cliente-completar', () => ({ completarCliente: mocks.completarMock }))

import { PATCH } from '../cuentas/clientes/[id]/route'

const ctx = { params: Promise.resolve({ id: 'cli-1' }) }
function peticion(datos: unknown, constancia?: File) {
  const fd = new FormData()
  if (datos !== undefined) fd.append('datos', JSON.stringify(datos))
  if (constancia) fd.append('constancia', constancia)
  return new Request('http://x/api/cuentas/clientes/cli-1', { method: 'PATCH', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.driveEnv.current = { driveFolderIdCuentas: 'folder' }
  mocks.completarMock.mockResolvedValue({ status: 200, body: { cliente: { id: 'cli-1' } } })
})

describe('PATCH /api/cuentas/clientes/[id] (#130)', () => {
  it('exige la sección cuentas (no cotizaciones) y no hace nada si no hay permiso', async () => {
    mocks.requireSectionMock.mockResolvedValueOnce({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await PATCH(peticion({ rfc: 'MAZ180920HJ5' }), ctx)
    expect(res.status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('cuentas')
    expect(mocks.completarMock).not.toHaveBeenCalled()
  })

  it('valida el JSON: RFC mal formado, correo inválido o sin el campo datos', async () => {
    expect((await PATCH(peticion({ rfc: 'abc' }), ctx)).status).toBe(400)
    expect((await PATCH(peticion({ correo: 'no-es-correo' }), ctx)).status).toBe(400)
    expect((await PATCH(peticion(undefined), ctx)).status).toBe(400)
    expect(mocks.completarMock).not.toHaveBeenCalled()
  })

  it('pasa el RFC normalizado, el contacto y la constancia al servicio', async () => {
    const constancia = new File(['%PDF'], 'c.pdf', { type: 'application/pdf' })
    const res = await PATCH(peticion({ rfc: ' maz180920hj5 ', contacto: 'Ana' }, constancia), ctx)
    expect(res.status).toBe(200)
    const arg = mocks.completarMock.mock.calls[0][0]
    expect(arg).toMatchObject({ id: 'cli-1', datos: { rfc: 'MAZ180920HJ5', contacto: 'Ana' }, uploadFolderId: 'folder' })
    expect(arg.constancia).toBeInstanceOf(File)
  })

  it('con constancia pero sin Drive configurado falla explícito y no guarda nada', async () => {
    mocks.driveEnv.current = null
    const res = await PATCH(peticion({ rfc: 'MAZ180920HJ5' }, new File(['%PDF'], 'c.pdf', { type: 'application/pdf' })), ctx)
    expect(res.status).toBe(500)
    expect(mocks.completarMock).not.toHaveBeenCalled()
  })

  it('devuelve tal cual el estado del servicio (p. ej. rfc_distinto = 409)', async () => {
    mocks.completarMock.mockResolvedValueOnce({ status: 409, body: { error: 'rfc_distinto' } })
    const res = await PATCH(peticion({ rfc: 'MAZ180920HJ5' }), ctx)
    expect(res.status).toBe(409)
  })
})
