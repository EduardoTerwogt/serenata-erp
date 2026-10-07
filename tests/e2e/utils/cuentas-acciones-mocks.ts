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

function estadoCobro(): EstadoCuentaRespuesta {
  const a = factura('fa', 'F-A_Altavista.xml', '2026-09-12', 'PPD', [
    concepto('cobro', 'SH001', 'Spot TV 30s', 185600),
    concepto('cobro', 'SH003', 'Making of', 58000),
    concepto('cobro', 'SH004', 'Versiones redes', 46400),
    concepto('cobro', 'SH006', 'Post adicional', 69600),
  ])
  const b = factura('fb', 'F-B_Altavista.xml', '2026-09-15', 'PPD', [concepto('cobro', 'SH002', 'Fotofija campaña', 92800), concepto('cobro', 'SH005', 'Casting', 34800)])
  return {
    lado: 'cobro',
    hoy: HOY_E2E,
    contraparte: CLIENTE,
    resumen: { total: a.total + b.total, pagado: 0, saldo: a.total + b.total, vencido: 0, facturas: 2, sin_factura: 0, sin_factura_saldo: 0 },
    facturas: [a, b],
    sin_factura: [],
    pagos: [],
  }
}

function estadoProveedor(): EstadoCuentaRespuesta {
  const f = [
    factura('d1', 'DS-0412.xml', '2026-09-03', 'PPD', [concepto('grupo', 'SH001', 'Spot TV 30s', 41760)]),
    factura('d2', 'DS-0415.xml', '2026-09-05', 'PUE', [concepto('grupo', 'SH003', 'Making of', 23200)]),
    factura('d3', 'DS-0419.xml', '2026-09-10', 'PPD', [concepto('grupo', 'SH004', 'Versiones redes', 31320)]),
  ]
  const total = f.reduce((a, x) => a + x.total, 0)
  return { lado: 'proveedor', hoy: HOY_E2E, contraparte: PROVEEDOR, resumen: { total, pagado: 0, saldo: total, vencido: 0, facturas: 3, sin_factura: 0, sin_factura_saldo: 0 }, facturas: f, sin_factura: [], pagos: [] }
}

export interface PagoMock {
  lado: LadoCuentas
  lineas: { id: string; monto: number; saldo_esperado: number }[]
  tipo_pago: string
  fecha_pago: string
  notas: string | null
  operation_id: string
}

export interface LlamadasAcciones {
  pagos: PagoMock[]
}

export interface OpcionesAcciones {
  /** Respuesta del POST de pagos (por default 200 con éxito). */
  pago?: { status: number; body: unknown }
}

/** El campo `datos` (JSON) de un multipart, sin depender de la librería del navegador. */
export function datosDeMultipart(postData: string | null): unknown {
  const m = postData?.match(/name="datos"\r?\n\r?\n([\s\S]*?)\r?\n--/)
  return m ? JSON.parse(m[1]) : null
}

export async function mockCuentasAcciones(page: Page, opciones: OpcionesAcciones = {}): Promise<LlamadasAcciones> {
  const llamadas: LlamadasAcciones = { pagos: [] }

  await page.route(/\/api\/cuentas\/estado-cuenta\?/, (route: Route) => {
    const lado = new URL(route.request().url()).searchParams.get('lado')
    return fulfillJson(route, lado === 'proveedor' ? estadoProveedor() : estadoCobro())
  })
  await page.route(/\/api\/clientes\?q=/, (route: Route) => {
    const q = (new URL(route.request().url()).searchParams.get('q') ?? '').toLowerCase()
    return fulfillJson(route, [{ id: CLIENTE.id, nombre: CLIENTE.nombre }].filter((c) => c.nombre.toLowerCase().includes(q)))
  })
  await page.route(/\/api\/proveedores$/, (route: Route) =>
    fulfillJson(route, [
      { id: PROVEEDOR.id, nombre: PROVEEDOR.nombre, activo: true },
      { id: 'prov-ana', nombre: 'Ana Vidal', activo: true },
    ])
  )
  await page.route(/\/api\/cuentas\/pagos\/estado\?/, (route: Route) => fulfillJson(route, { status: 'not_found' }))
  await page.route(/\/api\/cuentas\/pagos$/, async (route: Route) => {
    llamadas.pagos.push(datosDeMultipart(route.request().postData()) as PagoMock)
    const r = opciones.pago ?? { status: 200, body: { success: true, resumen: {}, pago: { pago_id: 'pago-1', comprobante_url: null } } }
    await fulfillJson(route, r.body, r.status)
  })
  return llamadas
}
