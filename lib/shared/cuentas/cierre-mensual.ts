/**
 * Rediseño de Cuentas B4 (docs/PLAN.md §7 B4, D15, D26, D30, T3): el cierre
 * del proyecto partido por mes de flujo de efectivo, con su fecha límite ante
 * el SAT (día 17 del mes siguiente).
 *
 * No recalcula nada fiscal: parte los totales de `calcularCierreProyecto`
 * (sin cambiarlo) en proporción a lo cobrado y lo pagado en cada mes.
 * - IVA trasladado del mes = cobrado en el mes × IVA / total de los cobros.
 * - IVA acreditable del mes = pagado al proveedor en el mes × IVA trasladado
 *   por el proveedor / su total a transferir.
 * - IVA a enterar del mes = trasladado − acreditable. Negativo = "IVA a
 *   favor" sin fecha límite (D30); no se arrastra a otro mes del proyecto.
 * - Retenciones del mes = pagado al proveedor en el mes × retenciones / total
 *   a transferir.
 * - ISR estimado del mes = ISR estimado × cobrado en el mes / total de cobros.
 * - Lo que falta cobrar o pagar va en una fila "Al cobrar" / "Al pagar".
 * Redondeo al centavo con el residuo en la última fila: la suma de las filas
 * de cada impuesto es exactamente el total del cierre.
 */
import type { CierreProyecto } from '@/lib/shared/cierre-proyecto'
import { round2 } from '@/lib/shared/decimal'

export interface MovimientoMes {
  /** YYYY-MM-DD */
  fecha: string
  monto: number
}

export interface CierreMensualInput {
  cierre: CierreProyecto
  /** Cada cobro con su total (con IVA) y sus pagos registrados. */
  cobros: { total: number; pagos: MovimientoMes[] }[]
  /** Pagos a proveedor en total a transferir, por `clave` del cierre (grupo o suelta). */
  pagosProveedor: Record<string, MovimientoMes[]>
}

export type ConceptoCierre = 'proveedores' | 'iva' | 'retenciones' | 'isr'

export interface FilaCierre {
  concepto: ConceptoCierre
  quien: string
  sub: string
  monto: number
  /** YYYY-MM del cobro o pago; null = pendiente ("Al cobrar" / "Al pagar") o agregado. */
  mes: string | null
  /** Día 17 del mes siguiente (YYYY-MM-DD); null sin fecha (pendiente o IVA a favor). */
  fecha_limite: string | null
  a_favor: boolean
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function mesLabel(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
}

export function fechaLimiteSat(mes: string): string {
  const y = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))
  const sy = m === 12 ? y + 1 : y
  const sm = m === 12 ? 1 : m + 1
  return `${sy}-${String(sm).padStart(2, '0')}-17`
}

function fechaCorta(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/** Suma por mes lo aplicado de cada movimiento, sin pasar del tope del concepto. */
function porMes(movs: MovimientoMes[], tope: number, acumular: Map<string, number>, factor: number) {
  if (factor === 0) return
  let restante = Math.max(0, tope)
  for (const m of [...movs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))) {
    if (restante <= 0) break
    const aplicado = Math.min(Math.max(0, m.monto), restante)
    restante -= aplicado
    const mes = m.fecha.slice(0, 7)
    acumular.set(mes, (acumular.get(mes) ?? 0) + aplicado * factor)
  }
}

/**
 * Redondea cada mes al centavo y deja el residuo exacto en la fila
 * pendiente; si no hay nada pendiente, en el último mes.
 */
function repartir(total: number, meses: Map<string, number>, pendienteReal: boolean) {
  const orden = Array.from(meses.keys()).sort()
  const filas = orden.map((mes) => ({ mes, monto: round2(meses.get(mes)!) })).filter((f) => f.monto !== 0)
  const suma = round2(filas.reduce((s, f) => s + f.monto, 0))
  let pendiente = round2(total - suma)
  if (!pendienteReal && filas.length > 0) {
    filas[filas.length - 1].monto = round2(filas[filas.length - 1].monto + pendiente)
    pendiente = 0
  }
  return { filas, pendiente }
}

export function calcularCierreMensual({ cierre, cobros, pagosProveedor }: CierreMensualInput): FilaCierre[] {
  const totalCobros = round2(cobros.reduce((s, c) => s + Math.max(0, c.total), 0))
  const cobradoMes = new Map<string, number>()
  for (const c of cobros) porMes(c.pagos, c.total, cobradoMes, 1)
  const cobrado = Array.from(cobradoMes.values()).reduce((s, v) => s + v, 0)
  const faltaCobrar = totalCobros - cobrado > 0.005

  const ivaTrasladadoMes = new Map<string, number>()
  const isrMes = new Map<string, number>()
  if (totalCobros > 0) {
    for (const [mes, v] of Array.from(cobradoMes.entries())) {
      ivaTrasladadoMes.set(mes, (v * cierre.iva_cobrado) / totalCobros)
      isrMes.set(mes, (v * cierre.isr_serenata_estimado) / totalCobros)
    }
  }

  const ivaAcreditableMes = new Map<string, number>()
  const retencionesMes = new Map<string, number>()
  let faltaPagar = false
  for (const q of cierre.quien_cuanto_cuando) {
    const pagos = pagosProveedor[q.clave] ?? []
    const total = q.total_a_transferir
    const pagado = pagos.reduce((s, p) => s + Math.max(0, p.monto), 0)
    if (total - pagado > 0.005) faltaPagar = true
    if (total <= 0) continue
    porMes(pagos, total, ivaAcreditableMes, q.iva_trasladado / total)
    porMes(pagos, total, retencionesMes, (q.iva_retenido + q.isr_retenido) / total)
  }

  const ivaMes = new Map<string, number>()
  for (const mes of Array.from(new Set(Array.from(ivaTrasladadoMes.keys()).concat(Array.from(ivaAcreditableMes.keys()))))) {
    ivaMes.set(mes, (ivaTrasladadoMes.get(mes) ?? 0) - (ivaAcreditableMes.get(mes) ?? 0))
  }

  const filas: FilaCierre[] = []

  const nProv = cierre.quien_cuanto_cuando.length
  if (nProv > 0) {
    filas.push({
      concepto: 'proveedores',
      quien: 'Proveedores',
      sub: `${nProv} ${nProv === 1 ? 'proveedor' : 'proveedores'} · IVA incluido, menos retenciones`,
      monto: round2(cierre.quien_cuanto_cuando.reduce((s, q) => s + q.total_a_transferir, 0)),
      mes: null,
      fecha_limite: null,
      a_favor: false,
    })
  }

  const iva = repartir(cierre.iva_neto_a_enterar, ivaMes, faltaCobrar || faltaPagar)
  for (const f of iva.filas) {
    const aFavor = f.monto < 0
    filas.push({
      concepto: 'iva',
      quien: `${aFavor ? 'IVA a favor' : 'IVA a enterar'} · ${mesLabel(f.mes)}`,
      sub: aFavor
        ? 'Se acredita en la declaración mensual de la empresa (art. 6 LIVA)'
        : `SAT · a más tardar el ${fechaCorta(fechaLimiteSat(f.mes))}`,
      monto: f.monto,
      mes: f.mes,
      fecha_limite: aFavor ? null : fechaLimiteSat(f.mes),
      a_favor: aFavor,
    })
  }
  if (iva.pendiente !== 0 || (iva.filas.length === 0 && cierre.iva_neto_a_enterar !== 0)) {
    const cuando = faltaCobrar && faltaPagar ? 'Al cobrar y al pagar' : faltaPagar ? 'Al pagar' : 'Al cobrar'
    filas.push({ concepto: 'iva', quien: 'IVA a enterar', sub: cuando, monto: iva.pendiente, mes: null, fecha_limite: null, a_favor: false })
  }

  const retTotal = round2(cierre.iva_retenido_total + cierre.isr_retenido_total)
  const ret = repartir(retTotal, retencionesMes, faltaPagar)
  for (const f of ret.filas) {
    filas.push({
      concepto: 'retenciones',
      quien: `Retenciones a enterar · ${mesLabel(f.mes)}`,
      sub: `SAT · a más tardar el ${fechaCorta(fechaLimiteSat(f.mes))}`,
      monto: f.monto,
      mes: f.mes,
      fecha_limite: fechaLimiteSat(f.mes),
      a_favor: false,
    })
  }
  if (ret.pendiente !== 0) {
    filas.push({ concepto: 'retenciones', quien: 'Retenciones a enterar', sub: 'Al pagar', monto: ret.pendiente, mes: null, fecha_limite: null, a_favor: false })
  }

  const isr = repartir(cierre.isr_serenata_estimado, isrMes, faltaCobrar)
  for (const f of isr.filas) {
    filas.push({
      concepto: 'isr',
      quien: `ISR estimado (30%) · ${mesLabel(f.mes)}`,
      sub: `SAT · pago provisional el ${fechaCorta(fechaLimiteSat(f.mes))}`,
      monto: f.monto,
      mes: f.mes,
      fecha_limite: fechaLimiteSat(f.mes),
      a_favor: false,
    })
  }
  if (isr.pendiente !== 0) {
    filas.push({ concepto: 'isr', quien: 'ISR estimado (30%)', sub: 'Al cobrar', monto: isr.pendiente, mes: null, fecha_limite: null, a_favor: false })
  }

  return filas
}
