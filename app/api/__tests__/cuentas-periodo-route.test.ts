import { beforeEach, describe, expect, it, vi } from 'vitest'

// Rediseño de Cuentas B3/O1b (docs/PLAN.md): GET /api/cuentas/periodo, /resumen y /avisos.
const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null as Response | null })),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))
vi.mock('@/lib/shared/hoy-cdmx', () => ({ hoyCdmx: () => '2026-09-24' }))

import { GET as getAvisos } from '../cuentas/avisos/route'
import { GET as getPeriodo } from '../cuentas/periodo/route'
import { GET as getResumen } from '../cuentas/resumen/route'

// Crudo de un solo proyecto (seleccionado), como cuentas_por_proyecto(p_year, p_proyecto).
const crudoSH061 = {
  proyectos: [['SH061', 'Aurora', 'Modelo', null, '2026-09-18', 0, 0, 0, 0]],
  cobros: [['cc-1', 'SH061', 'SH061', 'CC-1', 'Modelo', null, 'Aurora', 1000, 0, '2026-09-10', null, null, null]],
  pagos: [],
  grupos: [],
}

const tarjeta = {
  id: 'SH061', nombre: 'Aurora', cliente: 'Modelo', fecha_entrega: '2026-09-18', anio: 2026, mes: 9, sin_fecha: false, sin_proyecto: false,
  cuentas: { cerradas: false, reabiertas: false, pendientes: 1, hay_vencidos: true, fecha_cierre: null },
  totales: { cobros_total: 1000, cobrado: 0, por_cobrar: 1000, pagos_total: 0, pagado: 0, por_pagar: 0 },
}

// Periodo derivado en SQL (cuentas_periodo, O1b): estados y pasos como códigos.
const periodoSql = {
  anio: 2026, mes: 9, hoy: '2026-09-24',
  meses: [], conteo: { todas: 1, pendientes: 1, cerradas: 0 },
  totales: {
    ingresos: { total: 1000, cobrado: 0, por_cobrar: 1000 }, egresos: { total: 0, pagado: 0, por_pagar: 0 },
    utilidad: { bruta: 0, isr_estimado: 0, neta: 0 }, impuestos: { iva_a_enterar: 0, retenciones: 0, isr_estimado: 0, total: 0 },
  },
  opciones: { clientes: ['Modelo'], proveedores: [] },
  proyectos: { items: [tarjeta], total: 1, page: 1, page_size: 60 },
  sin_fecha: [],
  lista: {
    items: [{
      key: 'c:cc-1', tipo: 'cobro', objetivo: 'cobro', id: 'cc-1', proyecto_id: 'SH061', cotizacion_id: 'SH061', folio: 'CC-1',
      contraparte: 'Modelo', contraparte_id: null, concepto: 'Cotización SH061', items: 1, total: 1000, pagado: 0,
      total_estimado: false, regimen_fiscal: null, orden_pago_id: null, fecha_vencimiento: '2026-09-10',
      estado: 'vencido', paso: 'emitir_factura', paso_urgente: true, saldo: 1000, venc_dias: -14, resuelto: false,
      fecha_resuelto: null, metodo_desconocido: false, complementos: [],
      proyecto: { id: 'SH061', nombre: 'Aurora', mes: 9, sin_fecha: false },
    }],
    total: 1, page: 1, page_size: 60, proyectos: 1,
  },
}

const candidatosAvisos = [
  { categoria: 'vencidos', key: 'c:cc-1', proyecto_id: 'SH061', proyecto_nombre: 'Aurora', anio: 2026, mes: 9, fecha_entrega: '2026-09-18',
    contraparte: 'Modelo', concepto: 'Cotización SH061', monto: 1000, venc_dias: -14, fecha_vencimiento: '2026-09-10' },
  { categoria: 'por_emitir', key: 'c:cc-1', proyecto_id: 'SH061', proyecto_nombre: 'Aurora', anio: 2026, mes: 9, fecha_entrega: '2026-09-18',
    contraparte: 'Modelo', concepto: 'Cotización SH061', monto: 1000, venc_dias: -14, fecha_vencimiento: '2026-09-10' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockImplementation(async (fn: string) => {
    if (fn === 'cuentas_periodo') return { data: periodoSql, error: null }
    if (fn === 'cuentas_por_proyecto') return { data: crudoSH061, error: null }
    if (fn === 'cuentas_resumen') return { data: { hoy: '2026-09-24', anios: [{ anio: 2026, pendientes: 1 }], avisos: 2 }, error: null }
    if (fn === 'cuentas_avisos_items') return { data: candidatosAvisos, error: null }
    throw new Error(`RPC inesperada: ${fn}`)
  })
})

describe('GET /api/cuentas/periodo', () => {
  it('sin sesión de Cuentas no consulta nada', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo'))
    expect(res.status).toBe(403)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('parámetros inválidos -- 400 sin consultar', async () => {
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo?mes=13'))
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('sin año ni mes pide el año actual (CDMX) a cuentas_periodo y deja el mes a la BD (S16)', async () => {
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo?cliente=&q='))
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_periodo', {
      p: { anio: 2026, estado: 'todas', tipo: 'todo', vista: 'proyectos', page: 1, page_size: 60, hoy: '2026-09-24' },
    })
    const body = await res.json()
    expect(body).toMatchObject({ anio: 2026, mes: 9, hoy: '2026-09-24', seleccionado: null })
    expect(body.proyectos.items[0]).toEqual(tarjeta)
  })

  it('pone etiqueta, tono, paso y vencimiento a los códigos de la lista', async () => {
    const body = await (await getPeriodo(new Request('http://x/api/cuentas/periodo?vista=lista&mes=todo'))).json()
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_periodo', { p: expect.objectContaining({ vista: 'lista', mes: 'todo' }) })
    const fila = body.lista.items[0]
    expect(fila).toMatchObject({
      estado: 'vencido', etiqueta: 'Vencido', tono: 'cancelada', paso: 'emitir_factura', paso_etiqueta: 'Emitir factura',
      vencimiento: { fecha: '2026-09-10', dias: -14, vencido: true, texto: 'Vencido hace 14 días' },
    })
    expect(fila).not.toHaveProperty('venc_dias')
  })

  it('con proyecto lee crudo solo ese proyecto y arma el seleccionado', async () => {
    const body = await (await getPeriodo(new Request('http://x/api/cuentas/periodo?proyecto=SH061'))).json()
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_por_proyecto', { p_year: 2026, p_proyecto: 'SH061' })
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_periodo', { p: expect.not.objectContaining({ proyecto: expect.anything() }) })
    expect(body.seleccionado).toMatchObject({ id: 'SH061', conceptos: [{ key: 'c:cc-1', estado: 'vencido' }] })
    expect(body.seleccionado.cierre).toBeDefined()
  })

  it('error de la RPC -- 500 sin exponer el mensaje', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'relation boom' } })
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('boom')
  })
})

describe('GET /api/cuentas/resumen', () => {
  it('años con pendientes y contador de avisos, de cuentas_resumen', async () => {
    const res = await getResumen()
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_resumen', { p_hoy: '2026-09-24' })
    expect(await res.json()).toEqual({ hoy: '2026-09-24', anios: [{ anio: 2026, pendientes: 1 }], avisos: 2 })
  })
})

describe('GET /api/cuentas/avisos', () => {
  it('agrupa los candidatos de cuentas_avisos_items con sus textos', async () => {
    const res = await getAvisos()
    expect(res.status).toBe(200)
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_avisos_items', { p_hoy: '2026-09-24' })
    const body = await res.json()
    expect(body.total).toBe(2)
    expect(body.categorias.map((c: { categoria: string }) => c.categoria)).toEqual(['vencidos', 'por_emitir'])
    expect(body.categorias[0].items[0]).toMatchObject({ detalle: 'Vencido hace 14 días', fecha: '2026-09-10', monto: 1000 })
    expect(body.categorias[1].items[0]).toMatchObject({ detalle: 'Evento 18 sep 2026', fecha: '2026-09-18' })
  })
})
