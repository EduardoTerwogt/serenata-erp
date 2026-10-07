import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async (_s: string) => ({ response: null as Response | null, session: { user: { email: 'admin@serenata.test' } } })),
  extraerMock: vi.fn(),
  uploadMock: vi.fn(),
  rpcMock: vi.fn(),
  vigenteMock: vi.fn(),
  historialMock: vi.fn(),
  invalidarMock: vi.fn(),
  driveEnv: { current: { driveFolderIdCuentas: 'folder' } as { driveFolderIdCuentas: string } | null },
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: () => mocks.driveEnv.current }))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))
vi.mock('@/lib/server/cuentas/datos-fiscales', () => ({
  datosFiscalesVigentes: mocks.vigenteMock,
  historialDatosFiscales: mocks.historialMock,
  invalidarCacheDatosFiscales: mocks.invalidarMock,
}))
vi.mock('@/lib/server/cuentas/constancia-serenata', async () => {
  const real = await vi.importActual<typeof import('@/lib/server/cuentas/constancia-serenata')>('@/lib/server/cuentas/constancia-serenata')
  return { ...real, extraerConstancia: mocks.extraerMock }
})

import { GET, POST } from '../admin/datos-fiscales/route'
import { POST as LEER } from '../admin/datos-fiscales/leer/route'

const DATOS = { rfc: 'sho100101ab1', razon_social: 'Serenata House Entertainment S.A. de C.V.', regimen_fiscal: 'Régimen General de Ley Personas Morales', codigo_postal: '06700', confirmado: true }
const pdf = () => new File(['%PDF-1.4'], 'constancia.pdf', { type: 'application/pdf' })

function peticion(campos: { constancia?: File | null; datos?: unknown }) {
  const fd = new FormData()
  if (campos.constancia !== null) fd.append('constancia', campos.constancia ?? pdf())
  if (campos.datos !== undefined) fd.append('datos', JSON.stringify(campos.datos))
  return new Request('http://x', { method: 'POST', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null, session: { user: { email: 'admin@serenata.test' } } })
  mocks.driveEnv.current = { driveFolderIdCuentas: 'folder' }
  mocks.uploadMock.mockResolvedValue('https://drive.test/constancia.pdf')
  mocks.rpcMock.mockResolvedValue({ data: 'id-1', error: null })
  mocks.vigenteMock.mockResolvedValue({ id: 'id-1', rfc: 'SHO100101AB1' })
  mocks.historialMock.mockResolvedValue([{ id: 'id-1', vigente: true }])
  mocks.extraerMock.mockResolvedValue({ rfc: 'SHO100101AB1', razon_social: 'Serenata', regimen_fiscal: null, codigo_postal: null })
})

describe('datos fiscales de Serenata (B6a)', () => {
  it('todas las rutas exigen la sección admin', async () => {
    const denegado = () => ({ response: Response.json({ error: 'No autorizado' }, { status: 403 }), session: null as never })
    mocks.requireSectionMock.mockResolvedValue(denegado())
    expect((await GET()).status).toBe(403)
    expect((await POST(peticion({ datos: DATOS }))).status).toBe(403)
    expect((await LEER(peticion({}))).status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('admin')
    expect(mocks.rpcMock).not.toHaveBeenCalled()
    expect(mocks.uploadMock).not.toHaveBeenCalled()
  })

  it('GET devuelve la constancia vigente y el historial', async () => {
    const r = await GET()
    expect(await r.json()).toEqual({ vigente: { id: 'id-1', rfc: 'SHO100101AB1' }, historial: [{ id: 'id-1', vigente: true }] })
  })

  it('leer: devuelve lo leído con su validación y no guarda nada', async () => {
    const r = await LEER(peticion({}))
    const body = await r.json()
    expect(body.datos.rfc).toBe('SHO100101AB1')
    expect(body.validacion).toMatchObject({ ok: true, tipo_persona: 'moral' })
    expect(mocks.rpcMock).not.toHaveBeenCalled()
    expect(mocks.uploadMock).not.toHaveBeenCalled()
  })

  it('leer: rechaza un archivo que no es PDF o imagen', async () => {
    const r = await LEER(peticion({ constancia: new File(['x'], 'c.docx', { type: 'application/msword' }) }))
    expect(r.status).toBe(400)
    expect(mocks.extraerMock).not.toHaveBeenCalled()
  })

  it('guardar: valida de nuevo, sube el PDF a Drive y guarda en una sola transacción con el RFC normalizado', async () => {
    const r = await POST(peticion({ datos: DATOS }))
    expect(r.status).toBe(201)
    expect(mocks.uploadMock).toHaveBeenCalledTimes(1)
    expect(mocks.rpcMock).toHaveBeenCalledWith('guardar_datos_fiscales_serenata', {
      p_rfc: 'SHO100101AB1',
      p_razon_social: DATOS.razon_social,
      p_regimen_fiscal: DATOS.regimen_fiscal,
      p_codigo_postal: '06700',
      p_constancia_url: 'https://drive.test/constancia.pdf',
      p_constancia_nombre: 'constancia.pdf',
      p_usuario: 'admin@serenata.test',
    })
    expect(mocks.invalidarMock).toHaveBeenCalled()
  })

  it('guardar: sin confirmar, con RFC inválido o sin archivo no toca Drive ni la base', async () => {
    expect((await POST(peticion({ datos: { ...DATOS, confirmado: false } }))).status).toBe(400)
    const invalido = await POST(peticion({ datos: { ...DATOS, rfc: 'ABC' } }))
    expect(invalido.status).toBe(400)
    expect((await invalido.json()).error).toBe('constancia_invalida')
    expect((await POST(peticion({ constancia: null, datos: DATOS }))).status).toBe(400)
    expect(mocks.uploadMock).not.toHaveBeenCalled()
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('guardar: sin Drive configurado falla explícito y no guarda', async () => {
    mocks.driveEnv.current = null
    expect((await POST(peticion({ datos: DATOS }))).status).toBe(500)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })
})
