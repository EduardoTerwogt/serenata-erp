import type { Page, Route } from '@playwright/test'
import { fulfillJson } from './http'
import { armarPreviewOrden, type CandidatoCrudo, type NoIncluidaCruda } from '@/lib/server/ordenes-pago/preview-cuentas'
import type { HistorialOrdenesRespuesta, OrdenHistorial, SeleccionOrden } from '@/lib/shared/cuentas/ordenes-tipos'
import { HOY_E2E, PROYECTOS, REGIMEN, registroMock, transferir } from './cuentas-periodo-mocks'

/**
 * Rediseño de Cuentas B6: mocks de "Nueva orden" y del historial sobre el
 * fixture del handoff. El preview sale del armado real (preview-cuentas.ts);
 * generar una orden saca esos grupos del preview y los pone "En orden" en la
 * lista (registroMock.ordenados).
 */
export interface LlamadasOrdenes {
  generar: { idempotency_key: string; seleccion: SeleccionOrden[] }[]
  cancelar: { id: string; motivo: string }[]
}

function candidatos() {
  const elegibles: CandidatoCrudo[] = []
  const no_incluidas: NoIncluidaCruda[] = []
  for (const p of PROYECTOS) {
    p.pagos.forEach(([prov, concepto, neto, estado, nItems], k) => {
      const id = `${p.id}-g${k}`
      if (estado === 'pagado' || estado === 'en_orden' || registroMock.ordenados.has(id)) return
      const regimen = REGIMEN[prov] ?? 'moral'
      const n = nItems ?? 1
      const base = { tipo: 'grupo' as const, id, proyecto_id: p.id, proyecto_nombre: p.nombre, saldo: neto, total_a_transferir: estado === 'sin_factura' ? null : transferir(neto, regimen), monto_transferido: 0 }
      if (estado === 'sin_factura' || !p.evento || p.evento > HOY_E2E) {
        no_incluidas.push({ ...base, responsable_nombre: prov, regimen_fiscal: regimen, motivo: estado === 'sin_factura' ? 'sin_factura' : 'evento_pendiente', fecha_evento: p.evento })
        return
      }
      elegibles.push({
        ...base,
        folios: [p.id],
        fecha_evento: p.evento,
        responsable: { id: `prov-${prov}`, nombre: prov, regimen_fiscal: regimen, banco: 'BBVA', clabe: '012180001234567891', correo: 'facturas@proveedor.test', telefono: null },
        items: Array.from({ length: n }, (_, i) => ({ cuenta_id: `${id}-cp${i}`, descripcion: n > 1 ? `${concepto} · parte ${i + 1}` : concepto, cantidad: 1, cotizacion_id: p.id, saldo: Math.round((neto / n) * 100) / 100 })),
      })
    })
  }
  return { hoy: HOY_E2E, elegibles, no_incluidas, no_incluidas_total: no_incluidas.length }
}

const ORDENES: OrdenHistorial[] = [
  { id: 'o1', fecha_generacion: '2026-09-19', pdf_url: 'https://drive.test/o1.pdf', pdf_nombre: 'O.P 19-Sep SH058,SH061.pdf', estado: 'GENERADA', monto: 107216, monto_estimado: false, pagado: 0, cuentas: 2, proyectos: ['SH058', 'SH061'], desglose: [{ proyecto_id: 'SH058', cotizacion_folio: 'SH058', responsable_id: 'prov-José García', responsable_nombre: 'José García', monto: 19024 }, { proyecto_id: 'SH061', cotizacion_folio: 'SH061', responsable_id: 'prov-Foros Churubusco', responsable_nombre: 'Foros Churubusco', monto: 88160 }], cancelada_at: null, cancelada_motivo: null },
  { id: 'o2', fecha_generacion: '2026-09-15', pdf_url: 'https://drive.test/o2.pdf', pdf_nombre: 'O.P 15-Sep SH062.pdf', estado: 'COMPLETADA', monto: 21460, monto_estimado: false, pagado: 21460, cuentas: 1, proyectos: ['SH062'], desglose: [{ proyecto_id: 'SH062', cotizacion_folio: 'SH062', responsable_id: 'prov-Estudio Luz Norte', responsable_nombre: 'Estudio Luz Norte', monto: 21460 }], cancelada_at: null, cancelada_motivo: null },
  { id: 'o3', fecha_generacion: '2026-09-01', pdf_url: 'https://drive.test/o3.pdf', pdf_nombre: 'O.P 01-Sep SH059.pdf', estado: 'VENCIDA', monto: 18000, monto_estimado: false, pagado: 0, cuentas: 1, proyectos: ['SH059'], desglose: [{ proyecto_id: 'SH059', cotizacion_folio: 'SH059', responsable_id: 'prov-Mario Hernández', responsable_nombre: 'Mario Hernández', monto: 18000 }], cancelada_at: null, cancelada_motivo: null },
  { id: 'o4', fecha_generacion: '2026-08-22', pdf_url: null, pdf_nombre: 'O.P 22-Ago SH058.pdf', estado: 'PARCIALMENTE_PAGADA', monto: 44100, monto_estimado: false, pagado: 20000, cuentas: 2, proyectos: ['SH058'], desglose: [], cancelada_at: null, cancelada_motivo: null },
  { id: 'o5', fecha_generacion: '2026-07-10', pdf_url: null, pdf_nombre: 'O.P 10-Jul SH052.pdf', estado: 'CANCELADA', monto: 18400, monto_estimado: false, pagado: 0, cuentas: 1, proyectos: ['SH052'], desglose: [], cancelada_at: '2026-07-11T10:00:00Z', cancelada_motivo: 'Duplicada' },
  { id: 'o6', fecha_generacion: '2026-01-15', pdf_url: null, pdf_nombre: 'O.P 15-Ene SH036.pdf', estado: 'COMPLETADA', monto: 115000, monto_estimado: true, pagado: 115000, cuentas: 4, proyectos: ['SH036'], desglose: [], cancelada_at: null, cancelada_motivo: null },
]

export async function mockCuentasOrdenes(page: Page): Promise<LlamadasOrdenes> {
  const llamadas: LlamadasOrdenes = { generar: [], cancelar: [] }
  const ordenes = ORDENES.map((o) => ({ ...o }))

  await page.route(/\/api\/cuentas\/ordenes\/preview$/, (route) => fulfillJson(route, armarPreviewOrden(candidatos())))

  await page.route(/\/api\/cuentas\/ordenes\/generar$/, async (route: Route) => {
    const body = route.request().postDataJSON() as LlamadasOrdenes['generar'][number]
    llamadas.generar.push(body)
    // Total a transferir de lo seleccionado, como lo calcula la ruta real (saldo por transferir de cada grupo).
    const elegidos = candidatos().elegibles.filter((c) => body.seleccion.some((s) => s.id === c.id))
    const total = Math.round(elegidos.reduce((sum, c) => sum + (c.total_a_transferir ?? 0) - (c.monto_transferido ?? 0), 0) * 100) / 100
    for (const s of body.seleccion) registroMock.ordenados.add(s.id)
    await fulfillJson(route, {
      orden: { id: 'orden-nueva', pdf_url: 'https://drive.test/nueva.pdf', pdf_nombre: 'O.P 24-Sep SH059,SH061.pdf', cuentas: body.seleccion.length, responsables: body.seleccion.length, total_transferir: total },
    })
  })

  await page.route(/\/api\/cuentas\/ordenes\/([^/]+)\/cancelar$/, async (route) => {
    const id = /ordenes\/([^/]+)\/cancelar/.exec(route.request().url())![1]
    const { motivo } = route.request().postDataJSON() as { motivo: string }
    llamadas.cancelar.push({ id, motivo })
    const o = ordenes.find((x) => x.id === id)
    if (o) Object.assign(o, { estado: 'CANCELADA', cancelada_at: '2026-09-24T12:00:00Z', cancelada_motivo: motivo })
    await fulfillJson(route, { orden_pago_id: id, grupos: 1, cuentas: 1 })
  })

  await page.route(/\/api\/cuentas\/ordenes(\?.*)?$/, async (route) => {
    const sp = new URL(route.request().url()).searchParams
    const filtradas = ordenes.filter((o) => (!sp.get('q') || (o.pdf_nombre ?? '').toLowerCase().includes(sp.get('q')!.toLowerCase())) && (!sp.get('mes') || o.fecha_generacion.startsWith(sp.get('mes')!)))
    const conteos: HistorialOrdenesRespuesta['conteos'] = {}
    for (const o of filtradas) conteos[o.estado] = (conteos[o.estado] ?? 0) + 1
    const sel = filtradas.filter((o) => !sp.get('estado') || o.estado === sp.get('estado'))
    const size = Number(sp.get('page_size')) || 20
    const respuesta: HistorialOrdenesRespuesta = { rows: sel.slice(0, size), total_rows: sel.length, conteos, total_sin_estado: filtradas.length }
    await fulfillJson(route, respuesta)
  })

  return llamadas
}
