import { describe, expect, it, vi } from 'vitest'

/**
 * EF-2 1E-2: mismo hallazgo y mismo fix que
 * cuentas-pagar-subir-factura-route.test.ts -- esta ruta exponía el
 * mensaje técnico crudo del error real directo al cliente.
 */

const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null })),
  getCuentaCobrarByIdMock: vi.fn(),
  rpcMock: vi.fn(),
  getCotizacionByIdMock: vi.fn(),
  getProyectoByIdMock: vi.fn(),
  parseFacturaXMLMock: vi.fn(),
  calcularDeadlineMock: vi.fn(),
  uploadFileToDriveMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  getDocumentosCuentaCobrarMock: vi.fn(async () => [] as unknown[]),
  planearFacturaMock: vi.fn(),
  completarReemplazoMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/db', () => ({
  getCuentaCobrarById: mocks.getCuentaCobrarByIdMock,
  getDocumentosCuentaCobrar: mocks.getDocumentosCuentaCobrarMock,
  getCotizacionById: mocks.getCotizacionByIdMock,
  getProyectoById: mocks.getProyectoByIdMock,
}))
vi.mock('@/lib/server/xml/factura-parser', () => ({
  parseFacturaXML: mocks.parseFacturaXMLMock,
  calcularDeadline: mocks.calcularDeadlineMock,
}))
vi.mock('@/lib/server/cuentas/reemplazo-factura', () => ({ planearFactura: mocks.planearFacturaMock, completarReemplazo: mocks.completarReemplazoMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))
vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadFileToDriveMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))

import { POST } from '../cuentas-cobrar/[id]/subir-factura/route'

const params = Promise.resolve({ id: 'cuenta-1' })

function buildRequest(overrides: Partial<{ xml: File | null; pdf: File | null }> = {}) {
  const formData = new FormData()
  const xml = overrides.xml === undefined ? new File(['<factura/>'], 'f.xml', { type: 'text/xml' }) : overrides.xml
  if (xml) formData.append('factura_xml', xml)
  if (overrides.pdf) formData.append('factura_pdf', overrides.pdf)
  return new Request('http://localhost/api/cuentas-cobrar/cuenta-1/subir-factura', { method: 'POST', body: formData })
}

describe('POST /api/cuentas-cobrar/[id]/subir-factura', () => {
  it('un error no anticipado nunca expone su mensaje técnico -- responde safeMessage genérico + requestId', async () => {
    const detalleTecnico = 'PGRST301: JWT expirado contra serenata-erp-test'
    mocks.getCuentaCobrarByIdMock.mockRejectedValueOnce(new Error(detalleTecnico))

    const response = await POST(buildRequest(), { params })
    expect(response.status).toBe(500)

    const body = await response.json() as { error: string; requestId: string }
    expect(body.error).toBe('Error interno, intenta de nuevo')
    expect(body.error).not.toContain('PGRST301')
    expect(body.error).not.toContain(detalleTecnico)
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })

  it('EF-3 3D-12: XML_REQUIRED -- "Se requiere archivo XML de factura"', async () => {
    const response = await POST(buildRequest({ xml: null }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Se requiere archivo XML de factura' })
  })

  it('EF-3 3D-12: sin PDF nunca emite PDF_REQUIRED -- el PDF es opcional en CxC', async () => {
    mocks.getCuentaCobrarByIdMock.mockRejectedValueOnce(new Error('sondeo: no debe llegar aquí si PDF_REQUIRED se emitiera'))
    const response = await POST(buildRequest({ pdf: null }), { params })
    // Sin PDF pasa la validación de archivos y sigue de largo -- termina en
    // el mismo 500 genérico que cualquier otro fallo aguas abajo, nunca en
    // un 400 de "PDF requerido".
    expect(response.status).toBe(500)
  })

  it('EF-3 3D-12: XML_INVALID_TYPE -- "El archivo XML debe ser de tipo text/xml o application/xml"', async () => {
    const response = await POST(buildRequest({ xml: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo XML debe ser de tipo text/xml o application/xml' })
  })

  it('EF-3 3D-12: PDF_INVALID_TYPE (solo si se mandó un PDF) -- "El archivo PDF debe ser de tipo application/pdf"', async () => {
    const response = await POST(buildRequest({ pdf: new File(['x'], 'f.bin', { type: 'application/octet-stream' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo PDF debe ser de tipo application/pdf' })
  })

  it('EF-3 3D-12: FILE_TOO_LARGE -- "El archivo excede el límite de 4 MB" (supuesto 15)', async () => {
    const response = await POST(buildRequest({ xml: new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'f.xml', { type: 'text/xml' }) }), { params })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'El archivo excede el límite de 4 MB' })
  })

  describe('#123 (B2): la factura se liga por ligar_factura (T9, T19)', () => {
    function exito(estado: 'validado' | 'revision' = 'validado') {
      mocks.planearFacturaMock.mockResolvedValue({ ok: true, reemplazo: null })
      mocks.getCuentaCobrarByIdMock.mockResolvedValueOnce({ id: 'cuenta-1', cotizacion_id: 'SH001', proyecto_id: 'SH001', monto_total: 1000, monto_pagado: 0 })
      mocks.getCotizacionByIdMock.mockResolvedValueOnce({ id: 'SH001', tipo: 'PRINCIPAL', total: 1000 })
      mocks.getProyectoByIdMock.mockResolvedValueOnce({ id: 'SH001', proyecto: 'Evento' })
      mocks.parseFacturaXMLMock.mockReturnValueOnce({ fecha_emision: '2026-09-20', monto_total: 1000, uuid_timbrado: 'UUID-1', metodo_pago: 'PPD' })
      mocks.calcularDeadlineMock.mockReturnValueOnce('2099-10-20')
      mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
      mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/x')
      mocks.completarReemplazoMock.mockClear()
      mocks.rpcMock.mockReset()
      mocks.rpcMock.mockResolvedValue({ data: { factura_id: 'doc-xml', pdf_id: null, estado, detalle: estado === 'revision' ? 'No cuadra' : null, repetido: false }, error: null })
    }

    it('manda la cuenta, el XML (UUID, total, método), las fechas y el operation_id a la RPC; TS no escribe cachés', async () => {
      exito()
      const response = await POST(buildRequest(), { params })
      expect(response.status).toBe(200)
      expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
      const [nombre, args] = mocks.rpcMock.mock.calls[0]
      expect(nombre).toBe('ligar_factura')
      expect(args).toMatchObject({
        p_cuentas: [{ cuenta_id: 'cuenta-1', monto_esperado: null }],
        p_xml: expect.objectContaining({ uuid_cfdi: 'UUID-1', total_cfdi: 1000, metodo_pago_cfdi: 'PPD' }),
        p_fecha_emision: '2026-09-20',
        p_fecha_vencimiento: '2099-10-20',
        p_reemplaza: null,
      })
      expect(args.p_operation_id).toEqual(expect.any(String))
      const body = await response.json()
      expect(body).toMatchObject({ success: true, factura_id: 'doc-xml', estado_validacion: 'validado' })
      expect(mocks.completarReemplazoMock).not.toHaveBeenCalled()
    })

    it('un descuadre queda "En revisión" con el detalle de la RPC (P5), no se rechaza', async () => {
      exito('revision')
      const response = await POST(buildRequest(), { params })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ estado_validacion: 'revision', detalle_validacion: 'No cuadra' })
    })

    it('cuenta_ya_ligada → 409 con mensaje seguro', async () => {
      exito()
      mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'cuenta_ya_ligada: cuenta-1' } })
      const response = await POST(buildRequest(), { params })
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe('cuenta_ya_ligada')
    })

    it('error de RPC desconocido → 400 sin exponer el mensaje crudo', async () => {
      exito()
      mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'boom interno' } })
      const response = await POST(buildRequest(), { params })
      expect(response.status).toBe(400)
      expect(JSON.stringify(await response.json())).not.toContain('boom interno')
    })
  })

  describe('B7: reemplazo de una factura validada', () => {
    it('el plan rechaza -- responde su código sin subir nada', async () => {
      mocks.getCuentaCobrarByIdMock.mockResolvedValueOnce({ id: 'cuenta-1', cotizacion_id: 'SH001', proyecto_id: 'SH001', monto_total: 1000, monto_pagado: 0 })
      mocks.planearFacturaMock.mockResolvedValueOnce({ ok: false, status: 403, body: { error: 'sin_acceso_cuentas', message: 'sin acceso a Cuentas' } })
      mocks.uploadFileToDriveMock.mockClear()
      const response = await POST(buildRequest(), { params })
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({ error: 'sin_acceso_cuentas', message: 'sin acceso a Cuentas' })
      expect(mocks.planearFacturaMock).toHaveBeenCalledWith('cobro', expect.objectContaining({ proyecto_id: 'SH001' }), [], undefined, null)
      expect(mocks.uploadFileToDriveMock).not.toHaveBeenCalled()
    })

    it('con reemplazo, la RPC recibe la anterior y la baja apunta al XML nuevo', async () => {
      const reemplazo = { dominio: 'cobro', anteriores: ['doc-viejo'], motivo: 'RFC', usuario: 'admin@serenata.mx' }
      mocks.getCuentaCobrarByIdMock.mockResolvedValueOnce({ id: 'cuenta-1', cotizacion_id: 'SH001', proyecto_id: 'SH001', monto_total: 1000, monto_pagado: 1000 })
      mocks.getCotizacionByIdMock.mockResolvedValueOnce({ id: 'SH001', tipo: 'PRINCIPAL', total: 1000 })
      mocks.getProyectoByIdMock.mockResolvedValueOnce({ id: 'SH001', proyecto: 'Evento' })
      mocks.parseFacturaXMLMock.mockReturnValueOnce({ fecha_emision: '2026-09-20', monto_total: 1000, uuid_timbrado: 'UUID-2', metodo_pago: 'PUE' })
      mocks.calcularDeadlineMock.mockReturnValueOnce('2099-10-20')
      mocks.getGoogleEnvMock.mockReturnValue({ driveFolderIdCuentas: 'folder' })
      mocks.uploadFileToDriveMock.mockResolvedValue('https://drive/x')
      mocks.rpcMock.mockReset()
      mocks.rpcMock.mockResolvedValue({ data: { factura_id: 'doc-xml', pdf_id: null, estado: 'validado', detalle: null, repetido: false }, error: null })
      mocks.completarReemplazoMock.mockClear()
      mocks.planearFacturaMock.mockResolvedValueOnce({ ok: true, reemplazo })
      const response = await POST(buildRequest(), { params })
      expect(response.status).toBe(200)
      expect(mocks.rpcMock.mock.calls[0][1]).toMatchObject({ p_reemplaza: 'doc-viejo' })
      expect(mocks.completarReemplazoMock).toHaveBeenCalledWith(reemplazo, 'doc-xml')
    })
  })
})
