import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  filasPorTabla: {} as Record<string, unknown[]>,
  rpcMock: vi.fn(),
  updates: [] as { tabla: string; valores: unknown; id: unknown }[],
  subirCobroMock: vi.fn(),
  subirProveedorMock: vi.fn(),
  ligarComplementoMock: vi.fn(),
  candidatosMock: vi.fn(),
  resolverMock: vi.fn(),
  getGrupoMock: vi.fn(),
  getProyectoMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ getCuentaPagarGrupoById: mocks.getGrupoMock, getProyectoById: mocks.getProyectoMock }))
vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    rpc: mocks.rpcMock,
    from: (tabla: string) => {
      const cadena: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'order', 'limit']) cadena[m] = () => cadena
      cadena.maybeSingle = async () => ({ data: mocks.filasPorTabla[tabla]?.[0] ?? null, error: null })
      cadena.then = (res: (v: unknown) => void) => res({ data: mocks.filasPorTabla[tabla] ?? [], error: null })
      cadena.update = (valores: unknown) => ({ eq: (_c: string, id: unknown) => ({ is: async () => { mocks.updates.push({ tabla, valores, id }); return { error: null } } }) })
      return cadena
    },
  },
}))
vi.mock('../subir-factura', async () => {
  const real = await vi.importActual<typeof import('../subir-factura')>('../subir-factura')
  return { ...real, subirFacturaCobro: mocks.subirCobroMock }
})
vi.mock('../subir-factura-proveedor', () => ({ subirFacturaProveedor: mocks.subirProveedorMock }))
vi.mock('../complemento', () => ({ ligarComplemento: mocks.ligarComplementoMock }))
vi.mock('../estado-cuenta-rpc', () => ({ cargarCandidatosFactura: mocks.candidatosMock }))
vi.mock('../contrapartes', () => ({ resolverContraparteDeDestinos: mocks.resolverMock }))

import { avisoRfc, confirmarFactura, preseleccionPorFolios, previsualizarFactura } from '../facturas'

const SERENATA = 'SHO100101AB1'
const CLIENTE = 'CLI010101AAA'
const OP = '11111111-1111-4111-8111-111111111111'

function cfdi(opts: { tipo?: string; emisor?: string; receptor?: string; total?: string; conceptos?: string[]; uuid?: string }) {
  const conceptos = (opts.conceptos ?? ['Producción']).map((d) => `<cfdi:Concepto Descripcion="${d}" />`).join('')
  return `<cfdi:Comprobante TipoDeComprobante="${opts.tipo ?? 'I'}" Fecha="2026-09-20T10:00:00" SubTotal="1000.00" Total="${opts.total ?? '1160.00'}" MetodoPago="PPD">
    <cfdi:Emisor Rfc="${opts.emisor ?? SERENATA}" /><cfdi:Receptor Rfc="${opts.receptor ?? CLIENTE}" />
    <cfdi:Conceptos>${conceptos}</cfdi:Conceptos>
    <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${opts.uuid ?? 'AAAAAAAA-0000-4000-8000-000000000001'}" /></cfdi:Complemento>
  </cfdi:Comprobante>`
}
const archivo = (xml: string) => new File([xml], 'f.xml', { type: 'text/xml' })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SERENATA_RFC = SERENATA
  for (const k of Object.keys(mocks.filasPorTabla)) delete mocks.filasPorTabla[k]
  mocks.updates.length = 0
  mocks.candidatosMock.mockResolvedValue([
    { cuenta_id: 'c1', cotizacion_id: 'SH061' },
    { cuenta_id: 'c2', cotizacion_id: 'SH062' },
    { cuenta_id: 'c3', cotizacion_id: 'SH099' },
  ])
  mocks.rpcMock.mockResolvedValue({ data: { estado: 'validado', n: 2 }, error: null })
  mocks.subirCobroMock.mockResolvedValue({ status: 200, body: { success: true } })
  mocks.subirProveedorMock.mockResolvedValue({ status: 200, body: { success: true } })
  mocks.ligarComplementoMock.mockResolvedValue({ status: 200, body: { success: true } })
  mocks.resolverMock.mockResolvedValue({ ok: true, contraparte: { id: 'cli-1', nombre: 'Agencia Aurora', rfc: CLIENTE } })
})

describe('helpers puros', () => {
  it('preselecciona las cuentas cuyos folios nombra el XML (P4)', () => {
    expect(preseleccionPorFolios([{ cuenta_id: 'c1', cotizacion_id: 'SH061' }, { cuenta_id: 'c2', cotizacion_id: 'SH062-A' }, { cuenta_id: 'c3', cotizacion_id: null }], ['SH062-A', 'SH999'])).toEqual(['c2'])
    expect(preseleccionPorFolios([{ cuenta_id: 'c1', cotizacion_id: 'SH061' }], [])).toEqual([])
  })

  it('un RFC distinto al de la ficha es un aviso; igual, ausente o sin ficha, no', () => {
    expect(avisoRfc('cliente', 'AAA010101AAA', 'BBB010101BBB')).toMatch(/no coincide con el del cliente/)
    expect(avisoRfc('proveedor', 'aaa010101aaa ', 'AAA010101AAA')).toBeNull()
    expect(avisoRfc('cliente', 'AAA010101AAA', null)).toBeNull()
    expect(avisoRfc('cliente', null, 'AAA010101AAA')).toBeNull()
  })
})

describe('previsualizarFactura', () => {
  it('sin SERENATA_RFC falla explícito, no valida en silencio (T20)', async () => {
    delete process.env.SERENATA_RFC
    await expect(previsualizarFactura({ xmlFile: archivo(cfdi({})), cuentas: [] })).rejects.toMatchObject({ code: 'serenata_rfc_faltante' })
  })

  it('un XML que no es de ni para Serenata, o un egreso, se rechaza', async () => {
    const ajeno = await previsualizarFactura({ xmlFile: archivo(cfdi({ emisor: 'AAA010101AAA', receptor: 'BBB010101BBB' })), cuentas: [] })
    expect(ajeno).toMatchObject({ status: 400, body: { error: 'rfc_ajeno' } })
    const egreso = await previsualizarFactura({ xmlFile: archivo(cfdi({ tipo: 'E' })), cuentas: [] })
    expect(egreso).toMatchObject({ status: 400, body: { error: 'tipo_no_soportado' } })
  })

  it('factura de cliente: encuentra al cliente por RFC, preselecciona por folios SH y calcula el cuadre', async () => {
    mocks.filasPorTabla.clientes = [{ id: 'cli-1', nombre: 'Agencia Aurora', rfc: CLIENTE }]
    const r = await previsualizarFactura({ xmlFile: archivo(cfdi({ conceptos: ['Producción SH061', 'Complementaria SH062'] })), cuentas: ['c1', 'c2'] })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      tipo: 'factura_cobro',
      lado: 'cobro',
      contraparte: { id: 'cli-1' },
      preseleccion: ['c1', 'c2'],
      ofrecer_guardar_rfc: false,
      rfc_distinto: false,
      cuadre: { estado: 'validado' },
    })
    expect(mocks.candidatosMock).toHaveBeenCalledWith('cobro', 'cli-1')
    expect(mocks.rpcMock).toHaveBeenCalledWith('factura_cuadre', { p_total: 1160, p_cuentas: ['c1', 'c2'] })
  })

  it('concepto genérico: no preselecciona nada; sin cuentas elegidas no hay cuadre', async () => {
    mocks.filasPorTabla.clientes = [{ id: 'cli-1', nombre: 'Agencia Aurora', rfc: CLIENTE }]
    const r = await previsualizarFactura({ xmlFile: archivo(cfdi({ conceptos: ['Servicios de producción'] })), cuentas: [] })
    expect(r.body).toMatchObject({ preseleccion: [], cuadre: null })
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('sin coincidencia por RFC no propone candidatos; elegida a mano ofrece guardar el RFC (P24)', async () => {
    const sin = await previsualizarFactura({ xmlFile: archivo(cfdi({})), cuentas: [] })
    expect(sin.body).toMatchObject({ contraparte: null, candidatos: [] })
    expect(mocks.candidatosMock).not.toHaveBeenCalled()

    mocks.filasPorTabla.clientes = [{ id: 'cli-9', nombre: 'Otro Cliente', rfc: null }]
    const manual = await previsualizarFactura({ xmlFile: archivo(cfdi({})), cuentas: [], contraparteId: 'cli-9' })
    expect(manual.body).toMatchObject({ contraparte: { id: 'cli-9' }, ofrecer_guardar_rfc: true })
  })

  it('varias contrapartes con el mismo RFC: no elige, devuelve las ambiguas', async () => {
    mocks.filasPorTabla.clientes = [{ id: 'a', nombre: 'A', rfc: CLIENTE }, { id: 'b', nombre: 'B', rfc: CLIENTE }]
    const r = await previsualizarFactura({ xmlFile: archivo(cfdi({})), cuentas: [] })
    expect(r.body).toMatchObject({ contraparte: null })
    expect((r.body.ambiguas as unknown[]).length).toBe(2)
  })

  it('el complemento (tipo P) lista las facturas que relaciona, con la que ya existe', async () => {
    const xml = `<cfdi:Comprobante TipoDeComprobante="P" Fecha="2026-09-25T10:00:00" Total="0">
      <cfdi:Emisor Rfc="${SERENATA}" /><cfdi:Receptor Rfc="${CLIENTE}" />
      <cfdi:Complemento><pago20:Pagos><pago20:Pago FechaPago="2026-09-25T12:00:00" Monto="500">
        <pago20:DoctoRelacionado IdDocumento="aaaaaaaa-0000-4000-8000-000000000001" ImpPagado="500.00" />
      </pago20:Pago></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`
    mocks.filasPorTabla.documentos_cuentas_cobrar = [{ id: 'fac-1', uuid_cfdi: 'AAAAAAAA-0000-4000-8000-000000000001', estado_validacion: 'validado', metodo_pago_cfdi: 'PPD', total_cfdi: 1160 }]
    const r = await previsualizarFactura({ xmlFile: archivo(xml), cuentas: [] })
    expect(r.body).toMatchObject({ tipo: 'complemento_cobro', relacionados: [{ monto_pagado: 500, factura: { id: 'fac-1' } }] })
  })
})

describe('confirmarFactura', () => {
  const base = { pdfFile: null, operationId: OP, guardarRfc: false, cuentas: [{ id: 'c1', monto_esperado: 580 }, { id: 'c2' }], usuario: 'staff@serenata.test', route: 'POST /api/cuentas/facturas' }

  it('cliente: liga todas las cuentas de una vez, en la carpeta del cliente y con el operation_id', async () => {
    const r = await confirmarFactura({ ...base, xmlFile: archivo(cfdi({})) })
    expect(r.status).toBe(200)
    expect(mocks.subirCobroMock).toHaveBeenCalledTimes(1)
    expect(mocks.subirCobroMock.mock.calls[0][0]).toMatchObject({
      cuentas: [{ id: 'c1', monto_esperado: 580 }, { id: 'c2' }],
      carpeta: '/Por Cobrar/Agencia Aurora',
      operationId: OP,
      aviso: null,
    })
  })

  it('un RFC distinto al de la ficha manda un aviso (la factura queda en revisión), no la rechaza', async () => {
    mocks.resolverMock.mockResolvedValueOnce({ ok: true, contraparte: { id: 'cli-1', nombre: 'Agencia Aurora', rfc: 'OTR010101AAA' } })
    await confirmarFactura({ ...base, xmlFile: archivo(cfdi({})) })
    expect(mocks.subirCobroMock.mock.calls[0][0].aviso).toMatch(/no coincide/)
  })

  it('sin cuentas no hay factura de cliente', async () => {
    const r = await confirmarFactura({ ...base, cuentas: [], xmlFile: archivo(cfdi({})) })
    expect(r).toMatchObject({ status: 400, body: { error: 'lineas_requeridas' } })
    expect(mocks.subirCobroMock).not.toHaveBeenCalled()
  })

  it('cuentas de varios clientes se rechazan antes de subir nada', async () => {
    mocks.resolverMock.mockResolvedValueOnce({ ok: false, status: 409, body: { error: 'clientes_distintos', message: 'x' } })
    const r = await confirmarFactura({ ...base, xmlFile: archivo(cfdi({})) })
    expect(r.status).toBe(409)
    expect(mocks.subirCobroMock).not.toHaveBeenCalled()
  })

  it('guardar_rfc escribe el RFC del XML solo si la ficha no tenía uno', async () => {
    mocks.resolverMock.mockResolvedValueOnce({ ok: true, contraparte: { id: 'cli-1', nombre: 'Agencia Aurora', rfc: null } })
    await confirmarFactura({ ...base, guardarRfc: true, xmlFile: archivo(cfdi({})) })
    expect(mocks.updates).toEqual([{ tabla: 'clientes', valores: { rfc: CLIENTE }, id: 'cli-1' }])

    mocks.updates.length = 0
    await confirmarFactura({ ...base, guardarRfc: true, xmlFile: archivo(cfdi({})) })
    expect(mocks.updates).toEqual([])
  })

  it('si el alta falla (p. ej. cuenta ya ligada) no se guarda el RFC', async () => {
    mocks.resolverMock.mockResolvedValueOnce({ ok: true, contraparte: { id: 'cli-1', nombre: 'Agencia Aurora', rfc: null } })
    mocks.subirCobroMock.mockResolvedValueOnce({ status: 409, body: { error: 'cuenta_ya_ligada' } })
    const r = await confirmarFactura({ ...base, guardarRfc: true, xmlFile: archivo(cfdi({})) })
    expect(r.status).toBe(409)
    expect(mocks.updates).toEqual([])
  })

  it('proveedor: exige el grupo, que el grupo sea del proveedor del XML y usa su carpeta', async () => {
    const xml = cfdi({ emisor: 'PROV010101AAA', receptor: SERENATA })
    const sinGrupo = await confirmarFactura({ ...base, cuentas: [], xmlFile: archivo(xml) })
    expect(sinGrupo).toMatchObject({ status: 400, body: { error: 'lineas_requeridas' } })

    mocks.getGrupoMock.mockResolvedValue({ id: 'g1', proyecto_id: 'SH061', responsable_id: 'prov-1', monto_total: 1000, estado: 'ABIERTO' })
    mocks.getProyectoMock.mockResolvedValue({ id: 'SH061', proyecto: 'Aurora' })
    mocks.filasPorTabla.proveedores = [{ id: 'prov-1', nombre: 'Luces del Sur', rfc: 'PROV010101AAA' }]

    const otro = await confirmarFactura({ ...base, cuentas: [], grupoId: 'g1', contraparteId: 'prov-2', xmlFile: archivo(xml) })
    expect(otro).toMatchObject({ status: 409, body: { error: 'contrapartes_distintas' } })

    const ok = await confirmarFactura({ ...base, cuentas: [], grupoId: 'g1', xmlFile: archivo(xml) })
    expect(ok.status).toBe(200)
    expect(mocks.subirProveedorMock.mock.calls[0][0]).toMatchObject({ carpeta: '/Por Pagar/Luces del Sur', aviso: null })
  })

  it('complemento: va a ligarComplemento del lado que lo emite, con el pago elegido', async () => {
    const xml = `<cfdi:Comprobante TipoDeComprobante="P" Fecha="2026-09-25T10:00:00" Total="0"><cfdi:Emisor Rfc="${SERENATA}" /><cfdi:Receptor Rfc="${CLIENTE}" /></cfdi:Comprobante>`
    mocks.filasPorTabla.clientes = [{ id: 'cli-1', nombre: 'Agencia Aurora', rfc: CLIENTE }]
    await confirmarFactura({ ...base, cuentas: [], pagoId: 'pago-1', xmlFile: archivo(xml) })
    expect(mocks.ligarComplementoMock.mock.calls[0][0]).toMatchObject({ lado: 'cobro', pagoId: 'pago-1', carpeta: '/Por Cobrar/Agencia Aurora' })
  })
})
