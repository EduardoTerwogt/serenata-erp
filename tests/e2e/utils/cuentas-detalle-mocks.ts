import type { Page, Route } from '@playwright/test'
import { fulfillJson } from './http'
import { armarDetalleCobro, armarDetallePago, type DocumentoFila } from '@/lib/server/cuentas/detalle-armar'
import { HOY_E2E, PROYECTOS, REGIMEN, registroMock, transferir, type PagoMock } from './cuentas-periodo-mocks'

/**
 * Rediseño de Cuentas B5: mocks del detalle de un concepto sobre el mismo
 * fixture que la lectura por periodo. El detalle sale del armado REAL del
 * servidor (detalle-armar.ts). Registrar un pago lo guarda en `registroMock`,
 * así el detalle y la lista que se vuelven a pedir ya lo traen.
 */
const r2 = (n: number) => Math.round(n * 100) / 100

/** Llamadas que la UI hizo durante la prueba (para verificar el contrato). */
export interface LlamadasDetalle {
  pagos: { url: string; campos: Record<string, string> }[]
  subidas: { url: string; campos: string[] }[]
}

function cobroFilas(id: string) {
  const m = /^(SH\d+)-cc(\d+)$/.exec(id)
  const p = m && PROYECTOS.find((x) => x.id === m[1])
  const c = p?.cobros[Number(m![2])]
  if (!p || !c) return null
  const k = Number(m![2])
  const [concepto, total, pagado, estado, venc] = c
  const fechaFactura = p.evento ?? '2026-09-01'
  const tieneFactura = estado !== 'sin_factura'
  const extra = registroMock.cobros.get(id) ?? []
  const documentos: DocumentoFila[] = tieneFactura
    ? [
        {
          id: `${id}-fxml`,
          tipo: 'FACTURA_XML',
          archivo_url: 'https://drive.test/factura.xml',
          archivo_nombre: `F-${p.id}.xml`,
          fecha_carga: `${estado === 'sin_complemento' ? '2026-07-01' : fechaFactura} 18:00:00`,
          estado_validacion: 'validado',
          metodo_pago_cfdi: estado === 'sin_complemento' ? 'PPD' : 'PUE',
        },
      ]
    : []
  return armarDetalleCobro(
    {
      cuenta: {
        id,
        folio: `CC-2026-${String(k + 1).padStart(5, '0')}`,
        cotizacion_id: k === 0 ? p.id : `${p.id}-C${k}`,
        cliente: p.cliente,
        monto_total: total,
        monto_pagado: r2(pagado + extra.reduce((s, x) => s + x.monto, 0)),
        fecha_factura: tieneFactura ? (estado === 'sin_complemento' ? '2026-07-01' : fechaFactura) : null,
        fecha_vencimiento: venc ?? null,
        notas: concepto,
      },
      proyecto: { id: p.id, nombre: p.nombre, fecha_entrega: p.evento },
      documentos,
      pagos: [
        ...(pagado > 0 ? [{ id: `${p.id}-pc${k}`, monto: pagado, tipo_pago: 'TRANSFERENCIA', fecha_pago: fechaFactura, comprobante_url: null, notas: null }] : []),
        ...extra.map((x) => ({ id: x.id, monto: x.monto, tipo_pago: x.tipo_pago, fecha_pago: x.fecha_pago, comprobante_url: x.comprobante_url, notas: x.notas })),
      ],
    },
    HOY_E2E
  )
}

function grupoFilas(id: string) {
  const m = /^(SH\d+)-g(\d+)$/.exec(id)
  const p = m && PROYECTOS.find((x) => x.id === m[1])
  const g = p?.pagos[Number(m![2])]
  if (!p || !g) return null
  const [prov, concepto, neto, estado, nItems] = g
  const reg = REGIMEN[prov] ?? 'moral'
  const total = transferir(neto, reg)
  const fechaFactura = p.evento ?? '2026-09-01'
  const pagado = estado === 'pagado'
  const extra = registroMock.grupos.get(id) ?? []
  const n = nItems ?? 1
  const cuentas = Array.from({ length: n }, (_, i) => ({
    id: `${id}-cp${i}`,
    item_id: `${id}-it${i}`,
    cotizacion_id: p.id,
    item_descripcion: n > 1 ? `${concepto} · parte ${i + 1}` : concepto,
    cantidad: 1,
    x_pagar: r2(neto / n),
    monto_pagado: pagado ? r2(neto / n) : 0,
    responsable_nombre: prov,
    correo: null,
    telefono: null,
    banco: null,
    clabe: null,
  }))
  const documentos: DocumentoFila[] =
    estado === 'sin_factura'
      ? []
      : [
          {
            id: `${id}-fxml`,
            tipo: 'FACTURA_PROVEEDOR_XML',
            archivo_url: 'https://drive.test/fp.xml',
            archivo_nombre: `FP-${p.id}.xml`,
            fecha_carga: `${fechaFactura} 19:00:00`,
            estado_validacion: 'validado',
          },
        ]
  const pagos: (PagoMock & { estimado: boolean })[] = [
    ...(pagado ? [{ id: `${id}-pp`, monto: total, fecha_pago: fechaFactura, tipo_pago: 'TRANSFERENCIA', notas: null, comprobante_url: 'https://drive.test/comprobante.pdf', estimado: false }] : []),
    ...extra.map((x) => ({ ...x, estimado: false })),
  ]
  return armarDetallePago({
    objetivo: 'grupo',
    destino: {
      id,
      proyecto_id: p.id,
      responsable_id: `prov-${prov}`,
      estado: estado === 'sin_factura' ? 'ABIERTO' : pagado ? 'PAGADO' : 'FACTURADO',
      neto,
      total_a_transferir: estado === 'sin_factura' ? null : total,
      monto_transferido: r2(pagos.reduce((s, x) => s + x.monto, 0)),
      orden_pago_id: estado === 'en_orden' ? 'orden-1' : null,
    },
    cuentas,
    proveedor: { id: `prov-${prov}`, nombre: prov, regimen_fiscal: reg, correo: 'proveedor@correo.test', telefono: '55 1234 5678', banco: 'BBVA', clabe: '012180001234567890' },
    proyecto: { id: p.id, nombre: p.nombre, fecha_entrega: p.evento },
    documentos,
    pagos: pagos.map((x) => ({ id: x.id, fecha_pago: x.fecha_pago, tipo_pago: x.tipo_pago, monto_transferido: x.monto, comprobante_url: x.comprobante_url, notas: x.notas, estimado: x.estimado })),
    orden: estado === 'en_orden' ? { id: 'orden-1', pdf_nombre: `OP-${p.id}.pdf`, pdf_url: 'https://drive.test/orden.pdf', estado: 'GENERADA', fecha_generacion: '2026-09-20T12:00:00Z' } : null,
  })
}

async function camposDe(route: Route) {
  const req = route.request()
  const body = req.postDataBuffer()
  const tipo = req.headers()['content-type'] ?? ''
  if (!body || !tipo.includes('multipart/form-data')) return {}
  const fd = await new Response(new Uint8Array(body), { headers: { 'content-type': tipo } }).formData()
  const campos: Record<string, string> = {}
  fd.forEach((v, k) => {
    campos[k] = typeof v === 'string' ? v : `archivo:${v.name}`
  })
  return campos
}

export async function mockCuentasDetalle(page: Page): Promise<LlamadasDetalle> {
  const llamadas: LlamadasDetalle = { pagos: [], subidas: [] }

  await page.route(/\/api\/cuentas-cobrar\/([^/]+)\/documentos$/, async (route) => {
    const id = decodeURIComponent(/cuentas-cobrar\/([^/]+)\//.exec(route.request().url())![1])
    if (route.request().method() === 'POST') {
      llamadas.subidas.push({ url: route.request().url(), campos: Object.keys(await camposDe(route)) })
      return fulfillJson(route, { documento: { id: 'nuevo' } }, 201)
    }
    const detalle = cobroFilas(id)
    return detalle ? fulfillJson(route, { detalle }) : fulfillJson(route, { error: 'Cuenta por cobrar no encontrada' }, 404)
  })

  await page.route(/\/api\/cuentas-pagar\/grupos\/([^/]+)\/documentos$/, async (route) => {
    const id = decodeURIComponent(/grupos\/([^/]+)\//.exec(route.request().url())![1])
    if (route.request().method() === 'POST') {
      llamadas.subidas.push({ url: route.request().url(), campos: Object.keys(await camposDe(route)) })
      return fulfillJson(route, { documento: { id: 'nuevo' } }, 201)
    }
    const detalle = grupoFilas(id)
    return detalle ? fulfillJson(route, { detalle }) : fulfillJson(route, { error: 'Grupo no encontrado' }, 404)
  })

  const registrar = (mapa: Map<string, PagoMock[]>, patron: RegExp) => async (route: Route) => {
    const id = decodeURIComponent(patron.exec(route.request().url())![1])
    const campos = await camposDe(route)
    llamadas.pagos.push({ url: route.request().url(), campos })
    const lista = mapa.get(id) ?? []
    lista.push({
      id: `${id}-extra${lista.length}`,
      monto: Number(campos.monto),
      fecha_pago: campos.fecha_pago,
      tipo_pago: campos.tipo_pago ?? 'TRANSFERENCIA',
      notas: campos.notas ?? null,
      comprobante_url: campos.comprobante ? 'https://drive.test/nuevo-comprobante' : null,
    })
    mapa.set(id, lista)
    await fulfillJson(route, { ok: true })
  }
  await page.route(/\/api\/cuentas-cobrar\/([^/]+)\/registrar-pago$/, registrar(registroMock.cobros, /cuentas-cobrar\/([^/]+)\//))
  await page.route(/\/api\/cuentas-pagar\/grupos\/([^/]+)\/registrar-pago$/, registrar(registroMock.grupos, /grupos\/([^/]+)\//))

  await page.route(/\/api\/cuentas-(cobrar|pagar)\/.*\/subir-(factura|complemento)$/, async (route) => {
    llamadas.subidas.push({ url: route.request().url(), campos: Object.keys(await camposDe(route)) })
    await fulfillJson(route, { ok: true }, 201)
  })
  await page.route(/\/api\/cuentas-pagar\/pagos\/([^/]+)\/comprobante$/, async (route) => {
    llamadas.subidas.push({ url: route.request().url(), campos: Object.keys(await camposDe(route)) })
    await fulfillJson(route, { pago_id: 'x' })
  })

  await page.route(/\/api\/proveedores$/, async (route) => {
    const nombres = Array.from(new Set(PROYECTOS.flatMap((p) => p.pagos.map((g) => g[0])))).sort((a, b) => a.localeCompare(b, 'es'))
    await fulfillJson(route, nombres.map((nombre) => ({ id: `prov-${nombre}`, nombre })))
  })
  await page.route(/\/api\/cuentas-pagar\/[^/]+\/historial-responsable$/, (route) => fulfillJson(route, { historial: [] }))

  return llamadas
}
