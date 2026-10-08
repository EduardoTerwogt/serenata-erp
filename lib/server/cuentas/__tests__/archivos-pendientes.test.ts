import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const eventos: string[] = []
  return {
    eventos,
    uploadMock: vi.fn(),
    rpcMock: vi.fn(),
    updates: [] as { tabla: string; valores: unknown; ids: unknown; url: unknown }[],
    doc: null as Record<string, unknown> | null,
    resolverMock: vi.fn(),
  }
})

vi.mock('@/lib/integrations/google/drive', () => ({ uploadFileToDrive: mocks.uploadMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: () => ({ driveFolderIdCuentas: 'raiz' }) }))
vi.mock('../contrapartes', () => ({ resolverContraparteDeDestinos: mocks.resolverMock }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => {
      mocks.eventos.push('datos')
      return mocks.rpcMock(...args)
    },
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.doc, error: null }),
          limit: async () => ({ data: [{ id: 'cuenta-1' }], error: null }),
        }),
      }),
      update: (valores: unknown) => {
        const registro = { tabla, valores, ids: null as unknown, url: null as unknown }
        mocks.updates.push(registro)
        const cadena = {
          in: (_c: string, ids: unknown) => {
            registro.ids = ids
            return cadena
          },
          eq: (c: string, v: unknown) => {
            if (c === 'archivo_url') registro.url = v
            else registro.ids = [v]
            return Object.assign(Promise.resolve({ error: null }), cadena)
          },
        }
        return cadena
      },
    }),
  },
}))

import { crearSubida, reintentarSubida } from '../archivos-pendientes'
import { subirFacturaCobro } from '../subir-factura'

const xml = new File(['<xml/>'], 'f.xml', { type: 'text/xml' })
const pdf = new File(['%PDF'], 'f.pdf', { type: 'application/pdf' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.eventos.length = 0
  mocks.updates.length = 0
  mocks.doc = null
  mocks.uploadMock.mockImplementation(async (_f: File, _c: string, nombre: string) => {
    mocks.eventos.push(`drive:${nombre}`)
    return `https://drive/${nombre}`
  })
})

describe('crearSubida', () => {
  it('sin `despues` sube a Drive en el momento y no deja nada pendiente', async () => {
    const s = crearSubida({ lado: 'cobro', carpeta: '/c', despues: false, route: 't' })
    expect(await s.guardar('xml', xml, 'f.xml')).toBe('https://drive/f.xml')
    expect(await s.terminar({ xml: ['d1'] })).toEqual([])
    expect(mocks.updates).toHaveLength(0)
  })

  it('con `despues` devuelve el valor pendiente sin tocar Drive, y `terminar` sube y reemplaza el enlace de cada documento', async () => {
    const s = crearSubida({ lado: 'proveedor', carpeta: '/c', despues: true, route: 't' })
    expect(await s.guardar('xml', xml, 'f.xml')).toBe('pendiente:xml')
    expect(await s.guardar('pdf', pdf, 'f.pdf')).toBe('pendiente:pdf')
    expect(mocks.uploadMock).not.toHaveBeenCalled()

    expect(await s.terminar({ xml: ['a', 'b'], pdf: ['c'] })).toEqual([])
    expect(mocks.updates).toEqual([
      { tabla: 'documentos_cuentas_pagar', valores: { archivo_url: 'https://drive/f.xml' }, ids: ['a', 'b'], url: 'pendiente:xml' },
      { tabla: 'documentos_cuentas_pagar', valores: { archivo_url: 'https://drive/f.pdf' }, ids: ['c'], url: 'pendiente:pdf' },
    ])
  })

  it('si Drive falla no lanza: devuelve los documentos pendientes y deja el enlace pendiente', async () => {
    mocks.uploadMock.mockRejectedValueOnce(new Error('Drive caído'))
    const s = crearSubida({ lado: 'cobro', carpeta: '/c', despues: true, route: 't' })
    await s.guardar('xml', xml, 'f.xml')
    await s.guardar('pdf', pdf, 'f.pdf')
    const pendientes = await s.terminar({ xml: ['x1'], pdf: ['p1'] })
    expect(pendientes).toEqual([{ lado: 'cobro', id: 'x1', rol: 'xml', nombre: 'f.xml' }])
    // El PDF sí llegó: solo el XML queda pendiente.
    expect(mocks.updates.map((u) => u.valores)).toEqual([{ archivo_url: 'https://drive/f.pdf' }])
  })
})

describe('subirFacturaCobro · datos primero, Drive después', () => {
  const cfdi = `<cfdi:Comprobante TipoDeComprobante="I" Fecha="2026-09-20T10:00:00" SubTotal="1000.00" Total="1160.00" MetodoPago="PPD"><cfdi:Emisor Rfc="SHO100101AB1"/><cfdi:Receptor Rfc="CLI010101AAA"/><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="AAAAAAAA-0000-4000-8000-000000000001"/></cfdi:Complemento></cfdi:Comprobante>`
  const params = (extra: Record<string, unknown> = {}) => ({
    cuentas: [{ id: 'c1' }],
    xmlFile: new File([cfdi], 'f.xml', { type: 'text/xml' }),
    pdfFile: pdf,
    carpeta: '/Por Cobrar/Cliente',
    usuario: null,
    operationId: 'op-1',
    route: 'test',
    ...extra,
  })

  it('escribe los datos con el enlace pendiente y solo después sube a Drive y reemplaza el enlace', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { factura_id: 'f1', pdf_id: 'p1', estado: 'validado', detalle: null, repetido: false }, error: null })
    const r = await subirFacturaCobro(params({ driveDespues: true }))

    expect(r.status).toBe(200)
    const args = mocks.rpcMock.mock.calls[0][1] as { p_xml: { archivo_url: string }; p_pdf: { archivo_url: string } }
    expect(args.p_xml.archivo_url).toBe('pendiente:xml')
    expect(args.p_pdf.archivo_url).toBe('pendiente:pdf')
    // Orden: los datos van antes que cualquier subida a Drive.
    expect(mocks.eventos[0]).toBe('datos')
    expect(mocks.eventos.slice(1).sort()).toEqual(['drive:f.pdf', 'drive:f.xml'])
    expect(mocks.updates.map((u) => u.ids).sort()).toEqual([['f1'], ['p1']])
    expect(r.body).not.toHaveProperty('archivos_pendientes')
  })

  it('si Drive falla la factura queda guardada (200) y responde qué archivos quedaron pendientes', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { factura_id: 'f1', pdf_id: null, estado: 'validado', detalle: null, repetido: false }, error: null })
    mocks.uploadMock.mockRejectedValue(new Error('Drive caído'))
    const r = await subirFacturaCobro(params({ driveDespues: true, pdfFile: null }))
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ success: true, factura_id: 'f1', archivos_pendientes: [{ lado: 'cobro', id: 'f1', rol: 'xml', nombre: 'f.xml' }] })
    expect(mocks.updates).toHaveLength(0)
  })

  it('si la base rechaza los datos no se sube nada a Drive', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'cuenta_ya_ligada: x', code: 'P0001' } })
    const r = await subirFacturaCobro(params({ driveDespues: true }))
    expect(r.status).toBe(409)
    expect(mocks.uploadMock).not.toHaveBeenCalled()
  })

  it('una operación repetida no vuelve a subir los archivos', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { factura_id: 'f1', pdf_id: null, estado: 'validado', detalle: null, repetido: true }, error: null })
    await subirFacturaCobro(params({ driveDespues: true }))
    expect(mocks.uploadMock).not.toHaveBeenCalled()
  })

  it('sin `driveDespues` conserva el orden de siempre: Drive y luego los datos', async () => {
    mocks.rpcMock.mockResolvedValue({ data: { factura_id: 'f1', pdf_id: null, estado: 'validado', detalle: null, repetido: false }, error: null })
    await subirFacturaCobro(params({ pdfFile: null }))
    expect(mocks.eventos).toEqual(['drive:f.xml', 'datos'])
    expect((mocks.rpcMock.mock.calls[0][1] as { p_xml: { archivo_url: string } }).p_xml.archivo_url).toBe('https://drive/f.xml')
  })
})

describe('reintentarSubida', () => {
  const xmlDelDoc = (uuid: string) => new File([`<cfdi:Comprobante TipoDeComprobante="I" Fecha="2026-09-20T10:00:00" Total="1160.00"><cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento></cfdi:Comprobante>`], 'f.xml', { type: 'text/xml' })
  beforeEach(() => mocks.resolverMock.mockResolvedValue({ ok: true, contraparte: { id: 'cl', nombre: 'Cliente SA', rfc: null } }))

  it('un documento que ya está en Drive no se toca', async () => {
    mocks.doc = { id: 'd1', tipo: 'FACTURA_XML', archivo_url: 'https://drive/x', uuid_cfdi: null }
    const r = await reintentarSubida({ lado: 'cobro', id: 'd1', archivo: xml, route: 't' })
    expect(r).toMatchObject({ status: 200, body: { pendiente: false } })
    expect(mocks.uploadMock).not.toHaveBeenCalled()
  })

  it('sube solo el archivo a la carpeta de la contraparte y reemplaza el enlace pendiente', async () => {
    mocks.doc = { id: 'd1', tipo: 'FACTURA_XML', archivo_url: 'pendiente:xml', uuid_cfdi: 'AAAAAAAA-0000-4000-8000-000000000001' }
    const r = await reintentarSubida({ lado: 'cobro', id: 'd1', archivo: xmlDelDoc('aaaaaaaa-0000-4000-8000-000000000001'), route: 't' })
    expect(r).toMatchObject({ status: 200, body: { pendiente: false } })
    expect(mocks.uploadMock).toHaveBeenCalledWith(expect.any(File), '/Por Cobrar/Cliente SA', 'f.xml', undefined)
    expect(mocks.updates[0]).toMatchObject({ tabla: 'documentos_cuentas_cobrar', url: 'pendiente:xml' })
  })

  it('un XML con otro UUID se rechaza y no se sube', async () => {
    mocks.doc = { id: 'd1', tipo: 'FACTURA_XML', archivo_url: 'pendiente:xml', uuid_cfdi: 'AAAAAAAA-0000-4000-8000-000000000001' }
    const r = await reintentarSubida({ lado: 'cobro', id: 'd1', archivo: xmlDelDoc('BBBBBBBB-0000-4000-8000-000000000002'), route: 't' })
    expect(r.status).toBe(409)
    expect(mocks.uploadMock).not.toHaveBeenCalled()
  })

  it('un PDF pendiente exige un PDF', async () => {
    mocks.doc = { id: 'd2', tipo: 'FACTURA_PDF', archivo_url: 'pendiente:pdf', uuid_cfdi: null, factura_documento_id: 'd1' }
    const r = await reintentarSubida({ lado: 'cobro', id: 'd2', archivo: xml, route: 't' })
    expect(r.status).toBe(400)
  })

  it('si Drive falla responde 502 y el documento sigue pendiente', async () => {
    mocks.doc = { id: 'd2', tipo: 'FACTURA_PDF', archivo_url: 'pendiente:pdf', uuid_cfdi: null, factura_documento_id: 'd1' }
    mocks.uploadMock.mockRejectedValue(new Error('Drive caído'))
    const r = await reintentarSubida({ lado: 'cobro', id: 'd2', archivo: pdf, route: 't' })
    expect(r.status).toBe(502)
    expect(mocks.updates).toHaveLength(0)
  })

  it('un documento inexistente es 404', async () => {
    const r = await reintentarSubida({ lado: 'proveedor', id: 'x', archivo: pdf, route: 't' })
    expect(r.status).toBe(404)
  })
})
