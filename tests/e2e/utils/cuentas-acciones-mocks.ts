import type { Page, Route } from '@playwright/test'
import type { ConceptoEstadoCuenta, EstadoCuentaRespuesta, FacturaEstadoCuenta, LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'
import { fulfillJson } from './http'
import { HOY_E2E } from './cuentas-periodo-mocks'

/**
 * #123 (B4): mocks de las ventanas del menú Acciones con el ejemplo del issue. Cliente Grupo Altavista: SH001–SH006,
 * Factura A = SH001 + SH003 + SH004 + SH006 = $359,600 (PPD) y Factura B = SH002 + SH005 = $127,600. Proveedor
 * Distrito Sonoro: DS-0412, DS-0415 y DS-0419 (un grupo cada una).
 */
export const CLIENTE = { id: 'cli-altavista', nombre: 'Grupo Altavista S.A. de C.V.', rfc: 'GAL120304AB1' }
export const PROVEEDOR = { id: 'prov-distrito', nombre: 'Distrito Sonoro', rfc: 'DSO190822KJ4' }

const concepto = (objetivo: 'cobro' | 'grupo', folio: string, nombre: string, total: number, pagado = 0): ConceptoEstadoCuenta => ({
  key: `${objetivo === 'cobro' ? 'c' : 'g'}:${folio}`,
  objetivo,
  id: `${objetivo}-${folio}`,
  proyecto_id: folio,
  proyecto_nombre: nombre,
  cotizacion_id: folio,
  folio,
  concepto: nombre,
  total,
  pagado,
  saldo: Math.round((total - pagado) * 100) / 100,
  estado: pagado >= total ? 'pagado' : pagado > 0 ? 'parcial' : 'facturado',
  paso: null,
  venc_dias: null,
  fecha_vencimiento: null,
  resuelto: pagado >= total,
})

const factura = (id: string, archivo: string, fecha: string, metodo: 'PUE' | 'PPD', conceptos: ConceptoEstadoCuenta[]): FacturaEstadoCuenta => {
  const total = conceptos.reduce((a, c) => a + c.total, 0)
  const pagado = conceptos.reduce((a, c) => a + c.pagado, 0)
  return {
    id,
    uuid_cfdi: `${id.toUpperCase()}-0000-0000-0000-000000000000`,
    total_cfdi: total,
    metodo_pago: metodo,
    estado_validacion: 'validado',
    detalle_validacion: null,
    archivo_url: null,
    archivo_nombre: archivo,
    fecha_carga: fecha,
    fecha_factura: fecha,
    fecha_vencimiento: null,
    total,
    pagado,
    saldo: Math.round((total - pagado) * 100) / 100,
    conceptos,
  }
}

/** Con `conPago`, el depósito del issue ($300,000 el 30 sep) ya está aplicado a la Factura A y sin complemento. */
function estadoCobro(conPago = false, id: string = CLIENTE.id): EstadoCuentaRespuesta {
  const a = factura('fa', 'F-A_Altavista.xml', '2026-09-12', 'PPD', [
    concepto('cobro', 'SH001', 'Spot TV 30s', 185600, conPago ? 185600 : 0),
    concepto('cobro', 'SH003', 'Making of', 58000, conPago ? 58000 : 0),
    concepto('cobro', 'SH004', 'Versiones redes', 46400, conPago ? 46400 : 0),
    concepto('cobro', 'SH006', 'Post adicional', 69600, conPago ? 10000 : 0),
  ])
  const b = factura('fb', 'F-B_Altavista.xml', '2026-09-15', 'PPD', [concepto('cobro', 'SH002', 'Fotofija campaña', 92800), concepto('cobro', 'SH005', 'Casting', 34800)])
  const pagado = a.pagado + b.pagado
  return {
    lado: 'cobro',
    hoy: HOY_E2E,
    contraparte: { ...CLIENTE, id },
    resumen: { total: a.total + b.total, pagado, saldo: a.total + b.total - pagado, vencido: 0, facturas: 2, sin_factura: 0, sin_factura_saldo: 0 },
    facturas: [a, b],
    sin_factura: [],
    pagos: conPago
      ? [
          {
            id: 'pago-1',
            fecha_pago: '2026-09-30',
            tipo_pago: 'TRANSFERENCIA',
            comprobante_url: 'https://drive.test/transferencia_BBVA_30sep.pdf',
            archivo_nombre: 'transferencia_BBVA_30sep.pdf',
            notas: null,
            anulado: false,
            anulado_motivo: null,
            monto: 300000,
            aplicaciones: [
              { destino_id: 'cobro-SH001', factura_id: 'fa', folio: 'SH001', cotizacion_id: 'SH001', monto: 185600 },
              { destino_id: 'cobro-SH003', factura_id: 'fa', folio: 'SH003', cotizacion_id: 'SH003', monto: 58000 },
              { destino_id: 'cobro-SH004', factura_id: 'fa', folio: 'SH004', cotizacion_id: 'SH004', monto: 46400 },
              { destino_id: 'cobro-SH006', factura_id: 'fa', folio: 'SH006', cotizacion_id: 'SH006', monto: 10000 },
            ],
            complementos: [],
          },
        ]
      : [],
  }
}

function estadoProveedor(id: string = PROVEEDOR.id): EstadoCuentaRespuesta {
  const f = [
    factura('d1', 'DS-0412.xml', '2026-09-03', 'PPD', [concepto('grupo', 'SH001', 'Spot TV 30s', 41760)]),
    factura('d2', 'DS-0415.xml', '2026-09-05', 'PUE', [concepto('grupo', 'SH003', 'Making of', 23200)]),
    factura('d3', 'DS-0419.xml', '2026-09-10', 'PPD', [concepto('grupo', 'SH004', 'Versiones redes', 31320)]),
  ]
  const total = f.reduce((a, x) => a + x.total, 0)
  return { lado: 'proveedor', hoy: HOY_E2E, contraparte: { ...PROVEEDOR, id }, resumen: { total, pagado: 0, saldo: total, vencido: 0, facturas: 3, sin_factura: 0, sin_factura_saldo: 0 }, facturas: f, sin_factura: [], pagos: [] }
}

export interface PagoMock {
  lado: LadoCuentas
  lineas: { id: string; monto: number; saldo_esperado: number }[]
  tipo_pago: string
  fecha_pago: string
  notas: string | null
  operation_id: string
}

export interface FacturaMock {
  operation_id: string
  contraparte_id?: string | null
  guardar_rfc?: boolean
  cuentas?: { id: string; monto_esperado: number }[]
  grupo_id?: string | null
  pago_id?: string | null
  /** #130: alta de proveedor + renglones, o gasto extra, que arma la ventana. */
  preparar?: { proveedor?: Record<string, unknown>; renglones?: string[]; gasto?: { proyecto_id: string; concepto: string; costo_total: number } }
}

export interface LlamadasAcciones {
  /** #130: PATCH de la ficha del cliente (datos + si trae constancia), en orden. */
  clientes: { id: string; datos: Record<string, unknown> | null; constancia: boolean }[]
  pagos: PagoMock[]
  /** Altas confirmadas de factura o complemento. */
  facturas: FacturaMock[]
  /** Cuentas elegidas en cada vista previa, en orden. */
  previews: string[][]
}

export interface OpcionesAcciones {
  /** Respuesta del POST de pagos (por default 200 con éxito). */
  pago?: { status: number; body: unknown }
  /** El estado de cuenta del cliente ya trae el depósito del issue aplicado a la Factura A. */
  conPago?: boolean
  /** Respuesta del POST de facturas (por default 200 con la validación que calculó el preview). */
  factura?: { status: number; body: unknown }
}

/**
 * Nombre del XML → qué CFDI simula el mock de la vista previa:
 * `folios.xml` (Factura A de Altavista con los folios SH001, SH003, SH004 y SH006), `generico.xml` (mismo cliente, el
 * CFDI no trae folios), `proveedor.xml` (DS-0419 de Distrito Sonoro), `sinrfc.xml` (RFC que no es de nadie),
 * `complemento.xml` (REP de la Factura A), `ajeno.xml` (no es de Serenata, 400) y `duplicada.xml`.
 */
const MONTOS_COT: Record<string, number> = { SH001: 185600, SH002: 92800, SH003: 58000, SH004: 46400, SH005: 34800, SH006: 69600 }
const NOMBRES_COT: Record<string, string> = {
  SH001: 'Spot TV 30s',
  SH002: 'Fotofija campaña',
  SH003: 'Making of',
  SH004: 'Versiones redes',
  SH005: 'Casting',
  SH006: 'Post adicional',
}
const candidatosCobro = () =>
  Object.keys(MONTOS_COT).map((f) => ({ cuenta_id: `cobro-${f}`, folio: f, cotizacion_id: f, proyecto_id: f, proyecto: NOMBRES_COT[f], monto_total: MONTOS_COT[f], monto_pagado: 0, saldo: MONTOS_COT[f], fecha_entrega: '2026-09-10' }))
const candidatosProveedor = () => [
  { grupo_id: 'grupo-SH004', proyecto_id: 'SH004', proyecto: 'Versiones redes', estado: 'sin_factura', monto_total: 31320, conceptos: 2, fecha_entrega: '2026-09-10' },
  { grupo_id: 'grupo-SH006', proyecto_id: 'SH006', proyecto: 'Post adicional', estado: 'sin_factura', monto_total: 18560, conceptos: 1, fecha_entrega: '2026-10-02' },
]

/** #130: lo que la vista previa agrega a toda factura (la ruta siempre lo devuelve). */
const EMISOR_NUEVO = { rfc: 'NUE200101XY9', nombre: 'Luces del Norte SA de CV', regimen_codigo: '601', regimen_sugerido: 'moral' as const }
const camposNuevos = { tolerancia: 1, propuesta: [] as unknown[], coincidencias_nombre: [] as unknown[], emisor: null as unknown, receptor: { rfc: 'SHO100101AB1', nombre: 'Serenata House' }, cliente_tiene_constancia: null as boolean | null }

/** Renglones por asignar de SH004 que suman el neto del XML de `proveedornuevo.xml`. */
export const RENGLONES_SELECTOR = [
  { cuenta_id: 'cp-1', descripcion: 'Iluminación set A', costo_total: 12000, gasto_extra: false, responsable_id: null, responsable: null, grupo_id: null, grupo_estado: null, bloqueado: false },
  { cuenta_id: 'cp-2', descripcion: 'Iluminación set B', costo_total: 8000, gasto_extra: false, responsable_id: null, responsable: null, grupo_id: null, grupo_estado: null, bloqueado: false },
  { cuenta_id: 'cp-3', descripcion: 'Generador', costo_total: 5000, gasto_extra: false, responsable_id: 'prov-ana', responsable: 'Ana Vidal', grupo_id: 'g-ana', grupo_estado: 'ABIERTO', bloqueado: false },
  { cuenta_id: 'cp-4', descripcion: 'Banco de efectos', costo_total: 6500, gasto_extra: false, responsable_id: 'prov-fonoteca', responsable: 'Fonoteca MX', grupo_id: 'g-fono', grupo_estado: 'FACTURADO', bloqueado: true },
]

/** Conceptos de SH004 que ya son de `PROVEEDOR` en su grupo abierto (suman lo que cuadra con `proveedor.xml`). */
export const RENGLONES_DEL_PROVEEDOR = [
  { cuenta_id: 'cp-p1', descripcion: 'Edición versión A', costo_total: 15660, gasto_extra: false, responsable_id: PROVEEDOR.id, responsable: PROVEEDOR.nombre, grupo_id: 'grupo-SH004', grupo_estado: 'ABIERTO', bloqueado: false },
  { cuenta_id: 'cp-p2', descripcion: 'Edición versión B', costo_total: 15660, gasto_extra: false, responsable_id: PROVEEDOR.id, responsable: PROVEEDOR.nombre, grupo_id: 'grupo-SH004', grupo_estado: 'ABIERTO', bloqueado: false },
]

function previewDe(nombre: string, datos: { contraparte_id?: string | null; cuentas?: string[] }) {
  const cuentas = datos.cuentas ?? []
  const cfdiBase = { uuid: '6F2C0000-0000-0000-0000-000000A191AB', fecha: '2026-09-12T10:00:00', subtotal: null, rfc_emisor: 'SHO100101AB1', rfc_receptor: CLIENTE.rfc, conceptos: [] as string[] }
  if (nombre === 'complemento.xml') {
    return { tipo: 'complemento_cobro', lado: 'cobro', cfdi: { uuid: 'AAAA0000-0000-0000-0000-00000000REP1', fecha: '2026-10-01T09:00:00' }, relacionados: [{ uuid_factura: '6F2C0000-0000-0000-0000-000000A191AB', monto_pagado: 300000, factura: { id: 'fa', estado_validacion: 'validado', metodo_pago: 'PPD', total_cfdi: 359600 } }] }
  }
  if (nombre === 'proveedor.xml') {
    const elegida = cuentas[0]
    return {
      tipo: 'factura_proveedor',
      lado: 'proveedor',
      cfdi: { ...cfdiBase, uuid: 'DS000419-0000-0000-0000-000000000000', total: 31320, metodo_pago: 'PPD', rfc_emisor: PROVEEDOR.rfc, rfc_receptor: 'SHO100101AB1', folios: ['SH004'] },
      rfc_contraparte: PROVEEDOR.rfc,
      contraparte: PROVEEDOR,
      ambiguas: [],
      ofrecer_guardar_rfc: false,
      rfc_distinto: false,
      candidatos: candidatosProveedor(),
      preseleccion: [],
      cuadre: elegida ? { estado: 'validado', detalle: null, monto_total: 31320 } : null,
      duplicada: null,
      ...camposNuevos,
    }
  }
  if (nombre === 'proveedornuevo.xml') {
    return {
      tipo: 'factura_proveedor',
      lado: 'proveedor',
      cfdi: { ...cfdiBase, uuid: 'LN000001-0000-0000-0000-000000000000', total: 23200, subtotal: 20000, metodo_pago: 'PUE', rfc_emisor: EMISOR_NUEVO.rfc, rfc_receptor: 'SHO100101AB1', folios: [] },
      rfc_contraparte: EMISOR_NUEVO.rfc,
      contraparte: datos.contraparte_id ? PROVEEDOR : null,
      ambiguas: [],
      ofrecer_guardar_rfc: Boolean(datos.contraparte_id),
      rfc_distinto: false,
      candidatos: datos.contraparte_id ? candidatosProveedor() : [],
      preseleccion: [],
      cuadre: null,
      duplicada: null,
      ...camposNuevos,
      propuesta: [{ proyecto_id: 'SH004', proyecto: 'Versiones redes', renglones: ['cp-1', 'cp-2'], neto: 20000 }],
      coincidencias_nombre: [{ id: PROVEEDOR.id, nombre: PROVEEDOR.nombre, score: 0.62 }],
      emisor: EMISOR_NUEVO,
    }
  }
  const sinRfc = nombre === 'sinrfc.xml'
  const folios = nombre === 'folios.xml' || nombre === 'duplicada.xml' ? ['SH001', 'SH003', 'SH004', 'SH006'] : []
  const total = 359600
  const suma = cuentas.reduce((a, id) => a + (MONTOS_COT[id.replace('cobro-', '')] ?? 0), 0)
  const dif = Math.round((total - suma) * 100) / 100
  const cuadra = cuentas.length > 0 && Math.abs(dif) <= 0.01 * cuentas.length
  const contraparte = sinRfc && !datos.contraparte_id ? null : { ...CLIENTE, rfc: sinRfc ? null : CLIENTE.rfc }
  return {
    tipo: 'factura_cobro',
    lado: 'cobro',
    cfdi: { ...cfdiBase, total, metodo_pago: 'PPD', rfc_receptor: sinRfc ? 'XAXX010101000' : CLIENTE.rfc, folios },
    rfc_contraparte: sinRfc ? 'XAXX010101000' : CLIENTE.rfc,
    contraparte,
    ambiguas: [],
    ofrecer_guardar_rfc: sinRfc && !!contraparte,
    rfc_distinto: false,
    candidatos: contraparte ? candidatosCobro() : [],
    preseleccion: folios.map((f) => `cobro-${f}`),
    cuadre:
      contraparte && cuentas.length > 0
        ? {
            total_cfdi: total,
            n: cuentas.length,
            suma,
            diferencia: dif,
            tolerancia: 0.01 * cuentas.length,
            estado: cuadra ? 'validado' : 'revision',
            detalle: cuadra ? null : `El XML suma $359,600.00 y las cotizaciones ligadas suman $${suma.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            otro_cliente: false,
            ya_ligadas: [],
            no_encontradas: 0,
          }
        : null,
    duplicada: nombre === 'duplicada.xml' ? { id: 'fa' } : null,
    ...camposNuevos,
    receptor: { rfc: sinRfc ? 'XAXX010101000' : CLIENTE.rfc, nombre: CLIENTE.nombre },
    cliente_tiene_constancia: sinRfc && contraparte ? false : null,
  }
}

/** El campo `datos` (JSON) de un multipart, sin depender de la librería del navegador. */
export function datosDeMultipart(postData: string | null): unknown {
  const m = postData?.match(/name="datos"\r?\n\r?\n([\s\S]*?)\r?\n--/)
  return m ? JSON.parse(m[1]) : null
}

export async function mockCuentasAcciones(page: Page, opciones: OpcionesAcciones = {}): Promise<LlamadasAcciones> {
  const llamadas: LlamadasAcciones = { clientes: [], pagos: [], facturas: [], previews: [] }

  await page.route(/\/api\/cuentas\/estado-cuenta\?/, (route: Route) => {
    const q = new URL(route.request().url()).searchParams
    const estado = q.get('lado') === 'proveedor' ? estadoProveedor(q.get('id') ?? PROVEEDOR.id) : estadoCobro(opciones.conPago, q.get('id') ?? CLIENTE.id)
    // #130: `proyectos` limita el estado a los conceptos de esos proyectos (pago por proyecto).
    const proyectos = q.get('proyectos')?.split(',')
    if (proyectos) {
      estado.facturas = estado.facturas
        .map((f) => ({ ...f, conceptos: f.conceptos.filter((c) => proyectos.includes(c.proyecto_id ?? '')) }))
        .filter((f) => f.conceptos.length > 0)
        .map((f) => ({ ...f, total: f.conceptos.reduce((a, c) => a + c.total, 0), saldo: f.conceptos.reduce((a, c) => a + c.saldo, 0) }))
    }
    return fulfillJson(route, estado)
  })
  // #131: el desplegable de contraparte (cliente o proveedor) con búsqueda por nombre.
  await page.route(/\/api\/cuentas\/contrapartes\?/, (route: Route) => {
    const q = new URL(route.request().url()).searchParams
    const buscado = (q.get('q') ?? '').toLowerCase()
    const todas =
      q.get('lado') === 'cobro'
        ? [{ id: CLIENTE.id, nombre: CLIENTE.nombre, pendientes: 4 }]
        : [
            { id: PROVEEDOR.id, nombre: PROVEEDOR.nombre, pendientes: 3 },
            { id: 'prov-ana', nombre: 'Ana Vidal', pendientes: 1 },
          ]
    const contrapartes = todas.filter((c) => c.nombre.toLowerCase().includes(buscado))
    return fulfillJson(route, { total: contrapartes.length, contrapartes })
  })
  await page.route(/\/api\/proveedores$/, (route: Route) =>
    fulfillJson(route, [
      { id: PROVEEDOR.id, nombre: PROVEEDOR.nombre, activo: true },
      { id: 'prov-ana', nombre: 'Ana Vidal', activo: true },
    ])
  )
  await page.route(/\/api\/cuentas\/proyectos-selector\?/, (route: Route) => {
    // Registrar pago por proyecto: cada proyecto con la contraparte y el saldo de sus facturas abiertas.
    const params = new URL(route.request().url()).searchParams
    if (params.get('modo') === 'pago') {
      // Como SQL: con `contraparte` solo salen los proyectos con saldo de esa contraparte.
      const todos = [
        { proyecto_id: 'SH001', proyecto: 'Spot TV 30s', cliente: CLIENTE.nombre, fecha_entrega: null, contrapartes: [{ id: PROVEEDOR.id, nombre: PROVEEDOR.nombre, facturas: 1, saldo: 41760 }] },
        { proyecto_id: 'SH004', proyecto: 'Versiones redes', cliente: CLIENTE.nombre, fecha_entrega: null, contrapartes: [{ id: PROVEEDOR.id, nombre: PROVEEDOR.nombre, facturas: 1, saldo: 31320 }] },
        { proyecto_id: 'SH070', proyecto: 'Doc. Festival', cliente: CLIENTE.nombre, fecha_entrega: null, contrapartes: [{ id: 'prov-fonoteca', nombre: 'Fonoteca MX', facturas: 1, saldo: 9000 }] },
      ]
      const contraparte = params.get('contraparte')
      const proyectos = contraparte ? todos.filter((p) => p.contrapartes.some((c) => c.id === contraparte)) : todos
      return fulfillJson(route, { modo: 'pago', total: proyectos.length, page: 1, page_size: 25, proyectos })
    }
    // Conceptos de SH004: los del proveedor que ya tiene su grupo abierto, o los de la propuesta por asignar (proveedor nuevo).
    const delProveedor = new URL(route.request().url()).searchParams.get('contraparte') === PROVEEDOR.id
    return fulfillJson(route, {
      modo: 'renglones',
      total: 1,
      page: 1,
      page_size: 25,
      proyectos: [{ proyecto_id: 'SH004', proyecto: 'Versiones redes', cliente: CLIENTE.nombre, fecha_entrega: '2026-09-10', de_contraparte: delProveedor, renglones: delProveedor ? RENGLONES_DEL_PROVEEDOR : RENGLONES_SELECTOR }],
    })
  })
  await page.route(/\/api\/cuentas\/clientes\/[^/]+$/, (route: Route) => {
    const post = route.request().postData() ?? ''
    llamadas.clientes.push({ id: route.request().url().split('/').pop() ?? '', datos: datosDeMultipart(post) as Record<string, unknown> | null, constancia: post.includes('name="constancia"') })
    return fulfillJson(route, { cliente: { id: CLIENTE.id } })
  })
  await page.route(/\/api\/cuentas\/pagos\/estado\?/, (route: Route) => fulfillJson(route, { status: 'not_found' }))
  await page.route(/\/api\/cuentas\/pagos$/, async (route: Route) => {
    llamadas.pagos.push(datosDeMultipart(route.request().postData()) as PagoMock)
    const r = opciones.pago ?? { status: 200, body: { success: true, resumen: {}, pago: { pago_id: 'pago-1', comprobante_url: null } } }
    await fulfillJson(route, r.body, r.status)
  })
  await page.route(/\/api\/cuentas\/facturas\/preview$/, async (route: Route) => {
    const post = route.request().postData() ?? ''
    const nombre = post.match(/name="xml"; filename="([^"]+)"/)?.[1] ?? ''
    if (nombre === 'ajeno.xml') {
      return fulfillJson(route, { error: 'rfc_ajeno', message: 'El XML no es de ni para Serenata: revisa que sea el archivo correcto.' }, 400)
    }
    const datos = (datosDeMultipart(post) ?? {}) as { contraparte_id?: string | null; cuentas?: string[] }
    llamadas.previews.push(datos.cuentas ?? [])
    await fulfillJson(route, previewDe(nombre, datos))
  })
  await page.route(/\/api\/cuentas\/facturas$/, async (route: Route) => {
    llamadas.facturas.push(datosDeMultipart(route.request().postData()) as FacturaMock)
    const r = opciones.factura ?? { status: 200, body: { success: true, estado_validacion: 'validado', detalle_validacion: null } }
    await fulfillJson(route, r.body, r.status)
  })
  return llamadas
}
