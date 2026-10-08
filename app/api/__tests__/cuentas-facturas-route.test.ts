import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async (_s: string) => ({ response: null as Response | null, session: { user: { email: 'staff@serenata.test' } } })),
  previsualizarMock: vi.fn(),
  confirmarMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/cuentas/facturas', () => ({ previsualizarFactura: mocks.previsualizarMock, confirmarFactura: mocks.confirmarMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: () => ({ driveFolderIdCuentas: 'folder' }) }))

import { POST as PREVIEW } from '../cuentas/facturas/preview/route'
import { POST as CREAR } from '../cuentas/facturas/route'

const OP = '11111111-1111-4111-8111-111111111111'
const CUENTA = '22222222-2222-4222-8222-222222222222'

function peticion(campos: { xml?: File | null; pdf?: File | null; datos?: unknown; datosCrudo?: string }) {
  const fd = new FormData()
  if (campos.xml !== null) fd.append('xml', campos.xml ?? new File(['<cfdi/>'], 'f.xml', { type: 'text/xml' }))
  // El PDF es obligatorio (#131): por defecto viaja uno; `pdf: null` lo omite.
  if (campos.pdf !== null) fd.append('pdf', campos.pdf ?? new File(['%PDF'], 'f.pdf', { type: 'application/pdf' }))
  if (campos.datosCrudo !== undefined) fd.append('datos', campos.datosCrudo)
  else if (campos.datos !== undefined) fd.append('datos', JSON.stringify(campos.datos))
  return new Request('http://x', { method: 'POST', body: fd })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null, session: { user: { email: 'staff@serenata.test' } } })
  mocks.previsualizarMock.mockResolvedValue({ status: 200, body: { tipo: 'factura_cobro' } })
  mocks.confirmarMock.mockResolvedValue({ status: 200, body: { success: true } })
})

describe('POST /api/cuentas/facturas/preview', () => {
  it('exige la sección cuentas', async () => {
    mocks.requireSectionMock.mockResolvedValueOnce({ response: Response.json({ error: 'No autorizado' }, { status: 403 }), session: null as never })
    expect((await PREVIEW(peticion({}))).status).toBe(403)
    expect(mocks.requireSectionMock).toHaveBeenCalledWith('cuentas')
  })

  it('sin XML o con un tipo que no es XML → 400, sin llamar al servicio', async () => {
    expect((await PREVIEW(peticion({ xml: null }))).status).toBe(400)
    expect((await PREVIEW(peticion({ xml: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }))).status).toBe(400)
    expect(mocks.previsualizarMock).not.toHaveBeenCalled()
  })

  it('los datos son opcionales; con cuentas las pasa al servicio', async () => {
    expect((await PREVIEW(peticion({}))).status).toBe(200)
    expect(mocks.previsualizarMock).toHaveBeenLastCalledWith(expect.objectContaining({ cuentas: [], contraparteId: null }))
    await PREVIEW(peticion({ datos: { cuentas: [CUENTA] } }))
    expect(mocks.previsualizarMock).toHaveBeenLastCalledWith(expect.objectContaining({ cuentas: [CUENTA] }))
  })

  it('datos que no son JSON o cuentas inválidas → 400', async () => {
    expect((await PREVIEW(peticion({ datosCrudo: '{no' }))).status).toBe(400)
    expect((await PREVIEW(peticion({ datos: { cuentas: ['x'] } }))).status).toBe(400)
  })

  it('devuelve el status y el cuerpo del servicio (p. ej. un XML rechazado)', async () => {
    mocks.previsualizarMock.mockResolvedValueOnce({ status: 400, body: { error: 'rfc_ajeno', message: 'no es de Serenata' } })
    const res = await PREVIEW(peticion({}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('rfc_ajeno')
  })
})

describe('POST /api/cuentas/facturas', () => {
  it('exige la sección cuentas', async () => {
    mocks.requireSectionMock.mockResolvedValueOnce({ response: Response.json({ error: 'No autorizado' }, { status: 403 }), session: null as never })
    expect((await CREAR(peticion({}))).status).toBe(403)
  })

  it('exige operation_id (uuid) y datos', async () => {
    expect((await CREAR(peticion({}))).status).toBe(400)
    expect((await CREAR(peticion({ datos: { cuentas: [{ id: CUENTA }] } }))).status).toBe(400)
    expect(mocks.confirmarMock).not.toHaveBeenCalled()
  })

  it('una cotización repetida en la factura se rechaza antes del servicio', async () => {
    const res = await CREAR(peticion({ datos: { operation_id: OP, cuentas: [{ id: CUENTA }, { id: CUENTA }] } }))
    expect(res.status).toBe(400)
    expect(mocks.confirmarMock).not.toHaveBeenCalled()
  })

  it('pasa al servicio las cuentas con su total visto, el operation_id, el PDF y el usuario (sin tope de cotizaciones)', async () => {
    const muchas = Array.from({ length: 40 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, monto_esperado: 100 }))
    const pdf = new File(['%PDF'], 'f.pdf', { type: 'application/pdf' })
    const res = await CREAR(peticion({ pdf, datos: { operation_id: OP, cuentas: muchas, guardar_rfc: true } }))
    expect(res.status).toBe(200)
    const arg = mocks.confirmarMock.mock.calls[0][0]
    expect(arg.cuentas).toHaveLength(40)
    expect(arg).toMatchObject({ operationId: OP, guardarRfc: true, usuario: 'staff@serenata.test', uploadFolderId: 'folder' })
    expect(arg.pdfFile).toBeInstanceOf(File)
  })

  it('sin PDF (o con un PDF vacío) responde 400 y no llama al servicio', async () => {
    const datos = { operation_id: OP, cuentas: [{ id: CUENTA }] }
    const sin = await CREAR(peticion({ pdf: null, datos }))
    expect(sin.status).toBe(400)
    expect((await sin.json()).error).toBe('Se requiere el archivo PDF')
    expect((await CREAR(peticion({ pdf: new File([], 'f.pdf', { type: 'application/pdf' }), datos }))).status).toBe(400)
    expect(mocks.confirmarMock).not.toHaveBeenCalled()
  })

  it('XML y PDF juntos pasan del tope de la petición: 400 antes de llegar al servicio', async () => {
    const xml = new File([new Uint8Array(2.5 * 1024 * 1024)], 'f.xml', { type: 'text/xml' })
    const pdf = new File([new Uint8Array(2 * 1024 * 1024)], 'f.pdf', { type: 'application/pdf' })
    const res = await CREAR(peticion({ xml, pdf, datos: { operation_id: OP, cuentas: [{ id: CUENTA }] } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/juntos exceden 4 MB/)
    expect(mocks.confirmarMock).not.toHaveBeenCalled()
  })

  it('un grupo de proveedor y un pago_id de complemento viajan al servicio', async () => {
    await CREAR(peticion({ datos: { operation_id: OP, grupo_id: CUENTA, pago_id: CUENTA } }))
    expect(mocks.confirmarMock.mock.calls[0][0]).toMatchObject({ grupoId: CUENTA, pagoId: CUENTA, cuentas: [] })
  })
})
