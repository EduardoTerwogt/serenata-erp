import { fmtMoney } from '@/lib/quotations/format'
import type { ConceptoVista, ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { MESES_CORTOS, fechaCorta, plural } from './formato'

/** Umbral del control de cuadre: el mismo de las guardas de SQL. */
const UMBRAL_CUADRE = 0.01

const lista = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`)
const mesLabel = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`

/** Un cobro que el cliente ya pagó (todo o parte) y sigue sin factura: lo más urgente del proyecto. */
export const cobroSinFactura = (c: Pick<ConceptoVista, 'tipo' | 'estado' | 'pagado'>) => c.tipo === 'cobro' && c.estado === 'sin_factura' && c.pagado > 0

/** `~` delante de un monto aproximado (el total de un proveedor sin factura se estima con su régimen). */
export const montoAprox = (v: number, aprox: boolean) => (aprox ? `${v < 0 ? '-' : ''}~${fmtMoney(Math.abs(v))}` : fmtMoney(v))

/** Lo que falta para cerrar el proyecto, en frases ("facturarle al cliente", "asignar 4 proveedores"…). */
export function falta(conceptos: ConceptoVista[]): string[] {
  const pend = conceptos.filter((c) => !c.resuelto)
  const n = (tipo: ConceptoVista['tipo'], ...pasos: string[]) => pend.filter((c) => c.tipo === tipo && c.paso && pasos.includes(c.paso)).length
  const sinProv = n('pago', 'asignar_proveedor')
  const sinFactura = sinProv + n('pago', 'subir_factura')
  const out: string[] = []
  if (n('cobro', 'emitir_factura')) out.push('facturarle al cliente')
  else if (n('cobro', 'cobrar')) out.push('cobrar al cliente')
  if (sinProv) out.push(`asignar ${plural(sinProv, 'proveedor', 'proveedores')}`)
  if (sinFactura) out.push(sinProv === sinFactura ? 'recibir sus facturas' : `recibir ${plural(sinFactura, 'factura', 'facturas')} de proveedores`)
  if (n('pago', 'pagar')) out.push('pagar a proveedores')
  const resto = pend.length - n('cobro', 'emitir_factura', 'cobrar') - sinFactura - n('pago', 'pagar')
  if (resto > 0) out.push(`resolver ${plural(resto, 'pendiente más', 'pendientes más')}`)
  return out
}

export interface ResumenProyecto {
  utilidad: number
  /** Segunda línea del veredicto ("Falta …."); vacío si no falta nada. */
  falta: string
  /** Algún total a proveedor es estimado (sin factura): sus montos llevan «~». */
  aprox: boolean
  facturas: { recibidas: number; total: number }
  /** El reparto no cuadra: una factura fuera de tolerancia o un dato roto. */
  descuadre: boolean
  avisoIva: string | null
  /** Chip del SAT: el monto solo se dice cuando el mes ya cerró. */
  vence: string | null
}

export function resumenProyecto(p: ProyectoDetalle, hoy: string): ResumenProyecto {
  const pagos = p.conceptos.filter((c) => c.tipo === 'pago')
  const pasos = falta(p.conceptos)

  // Aviso del IVA: el del mes del cobro puede subir mientras falten pagos a proveedores en ese mismo mes.
  const mesCobro = p.cierre_mensual.find((f) => f.concepto === 'iva' && f.mes && !f.a_favor)?.mes ?? null
  const avisoIva =
    mesCobro && p.totales.por_pagar > 0.005 && hoy.slice(0, 7) <= mesCobro
      ? `El IVA de ${mesLabel(mesCobro)} puede salir más alto (hasta ${fmtMoney(p.cierre.iva_cobrado)}) si faltan pagos a proveedores ese mes.`
      : null

  // Chip del SAT: suma de lo que vence en la fecha límite más próxima.
  const filas = p.cierre_mensual.filter((f) => f.fecha_limite && f.monto > 0)
  const fecha = filas.map((f) => f.fecha_limite as string).sort()[0]
  const delDia = filas.filter((f) => f.fecha_limite === fecha)
  const monto = delDia.reduce((s, f) => s + f.monto, 0)
  const cerrado = fecha ? hoy.slice(0, 7) > (delDia[0].mes as string) : false

  return {
    utilidad: p.cierre.utilidad_bruta,
    falta: pasos.length ? `Falta ${lista(pasos)}.` : '',
    aprox: pagos.some((c) => c.total_estimado),
    facturas: { recibidas: pagos.filter((c) => !c.total_estimado).length, total: pagos.length },
    descuadre: !p.sin_proyecto && Math.abs(p.cierre.cuadre_diferencia) > UMBRAL_CUADRE,
    avisoIva,
    vence: fecha ? `Vence ${fechaCorta(fecha)}${cerrado ? ` · ${fmtMoney(monto)}` : ''}` : null,
  }
}
