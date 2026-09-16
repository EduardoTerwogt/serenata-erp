import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { getPagosComprobantesEnRango } from '@/lib/server/repositories/cuentas-cobrar'
import { round2 } from '@/lib/server/shared/decimal'
import { Cotizacion, GastoFijo } from '@/lib/types'

// Fase 5.6 -- Dashboard ejecutivo. Base contable: flujo de caja real (lo
// efectivamente cobrado/pagado en el periodo), no lo cotizado/aprobado --
// decisión de Eduardo, 2026-09-07.

export type PeriodoDashboard = 'mes' | 'trimestre' | 'anio'

// Tasa de ISR de persona moral sobre utilidad -- solo para el panel
// informativo "Cruce del periodo" del Dashboard (mismo criterio del mockup:
// "ISR 30% sobre utilidad · persona moral"). No es la misma tasa que
// TASA_RETENCION_ISR de factura-fiscal.ts (esa es la retención a personas
// físicas dentro de una factura puntual; esta es el ISR corporativo sobre
// la utilidad del periodo).
const TASA_ISR_PERSONA_MORAL = 0.30

const MES_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function parseAnchor(fecha?: string): Date {
  if (fecha) return new Date(`${fecha}T00:00:00Z`)
  const hoy = new Date()
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
}

interface RangoPeriodo {
  label: string
  inicio: string
  fin: string
}

/**
 * Rango [inicio, fin) del periodo que contiene `anchor`, desplazado
 * `offset` periodos hacia atrás (offset=0 es el periodo actual).
 */
export function rangoDePeriodo(periodo: PeriodoDashboard, anchor: Date, offset = 0): RangoPeriodo {
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()

  if (periodo === 'anio') {
    const y = year - offset
    return {
      label: `${y}`,
      inicio: toISODate(new Date(Date.UTC(y, 0, 1))),
      fin: toISODate(new Date(Date.UTC(y + 1, 0, 1))),
    }
  }

  if (periodo === 'trimestre') {
    const qStartMonthAbs = Math.floor(month / 3) * 3 - offset * 3
    const inicio = new Date(Date.UTC(year, qStartMonthAbs, 1))
    const fin = new Date(Date.UTC(year, qStartMonthAbs + 3, 1))
    const qNumber = Math.floor(inicio.getUTCMonth() / 3) + 1
    return {
      label: `Q${qNumber} ${inicio.getUTCFullYear()}`,
      inicio: toISODate(inicio),
      fin: toISODate(fin),
    }
  }

  // periodo === 'mes'
  const inicio = new Date(Date.UTC(year, month - offset, 1))
  const fin = new Date(Date.UTC(year, month - offset + 1, 1))
  return {
    label: `${MES_LABELS[inicio.getUTCMonth()]} ${inicio.getUTCFullYear()}`,
    inicio: toISODate(inicio),
    fin: toISODate(fin),
  }
}

/** Últimos `n` periodos hasta el actual (offset=0), en orden cronológico ascendente. */
export function bucketsDePeriodo(periodo: PeriodoDashboard, anchor: Date, n = 6): RangoPeriodo[] {
  const buckets: RangoPeriodo[] = []
  for (let offset = n - 1; offset >= 0; offset--) {
    buckets.push(rangoDePeriodo(periodo, anchor, offset))
  }
  return buckets
}

function enRango(fecha: string | null | undefined, inicio: string, fin: string): boolean {
  return !!fecha && fecha >= inicio && fecha < fin
}

export async function getGastosFijos(soloActivos = false): Promise<GastoFijo[]> {
  let query = supabaseAdmin.from('gastos_fijos').select('*').order('created_at', { ascending: false })
  if (soloActivos) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) throw error
  return data as GastoFijo[]
}

export async function createGastoFijo(data: { nombre: string; monto_mensual: number }): Promise<GastoFijo> {
  const { data: creado, error } = await supabaseAdmin
    .from('gastos_fijos')
    .insert({ nombre: data.nombre, monto_mensual: data.monto_mensual, activo: true })
    .select()
    .single()
  if (error) throw error
  return creado as GastoFijo
}

export async function updateGastoFijo(
  id: string,
  updates: Partial<Pick<GastoFijo, 'nombre' | 'monto_mensual' | 'activo'>>
): Promise<GastoFijo> {
  const { data, error } = await supabaseAdmin
    .from('gastos_fijos')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as GastoFijo
}

export interface ResumenDashboard {
  periodo: PeriodoDashboard
  periodoActual: { label: string; inicio: string; fin: string }
  kpis: {
    porCobrar: number
    porPagar: number
    cotizacionesAprobadas: number
    cotizacionesBorrador: number
  }
  balance: Array<{ label: string; ingresos: number; egresos: number }>
  fiscal: {
    ingresos: number
    egresos: number
    impuestos: number
    deudas: number
    utilidadAntesIsr: number
  }
  cobertura: {
    gastosFijos: Array<{ id: string; nombre: string; monto: number }>
    totalGastosFijos: number
    facturado: number
  }
  actividad: {
    proyectosCreados: number
    cotizacionesAprobadas: number
    proyectosEnCurso: number
  }
  cotizacionesRecientes: Array<Pick<Cotizacion, 'id' | 'proyecto' | 'cliente' | 'total' | 'estado' | 'created_at'>>
  /** Nombres de fuentes que fallaron y se sustituyeron por datos vacíos --
   * el resto del dashboard sigue calculándose con lo que sí respondió. */
  fuentesConError: string[]
}

function resuelto<T>(fuentesConError: string[], nombreFuente: string, resultado: PromiseSettledResult<T>, fallback: T): T {
  if (resultado.status === 'fulfilled') return resultado.value
  console.error(`[dashboard] Error obteniendo ${nombreFuente}:`, resultado.reason)
  fuentesConError.push(nombreFuente)
  return fallback
}

type CotizacionReciente = Pick<Cotizacion, 'id' | 'proyecto' | 'cliente' | 'total' | 'estado' | 'created_at'>

/**
 * EF-3 3B-10 (F13): agregados que antes traían la tabla completa a Node
 * (cuentas_cobrar/cuentas_pagar/cotizaciones/proyectos) ahora se calculan
 * en SQL (db/migrations/20260916_dashboard_agregados_sql.sql). Egresos por
 * bucket = suma de x_pagar de cuentas_pagar totalmente liquidadas (estado
 * PAGADO) cuya fecha_pago cae en el rango -- misma limitación conocida y
 * documentada (ver 20260905_atomic_registrar_pago_cuenta_pagar.sql): sin
 * ledger de abonos, un abono parcial suelto no cuenta aquí hasta que la
 * cuenta se liquide del todo. Ingresos por bucket se queda en JS: viene de
 * getPagosComprobantesEnRango(), que ya filtra server-side por rango --
 * fuera de alcance de 3B-10.
 */
async function getDashboardKpisCuentas(): Promise<{ por_cobrar: number; por_pagar: number }> {
  const { data, error } = await supabaseAdmin.rpc('dashboard_kpis_cuentas')
  if (error) throw error
  return data as { por_cobrar: number; por_pagar: number }
}

async function getDashboardEgresosPorBucket(buckets: RangoPeriodo[]): Promise<number[]> {
  const { data, error } = await supabaseAdmin.rpc('dashboard_egresos_por_bucket', {
    p_buckets: buckets.map((b) => ({ inicio: b.inicio, fin: b.fin })),
  })
  if (error) throw error
  return data as number[]
}

async function getDashboardActividadCotizaciones(inicio: string, fin: string): Promise<{ aprobadas: number; borrador: number }> {
  const { data, error } = await supabaseAdmin.rpc('dashboard_actividad_cotizaciones', { p_inicio: inicio, p_fin: fin })
  if (error) throw error
  return data as { aprobadas: number; borrador: number }
}

async function getDashboardActividadProyectos(inicio: string, fin: string): Promise<{ creados: number; en_curso: number }> {
  const { data, error } = await supabaseAdmin.rpc('dashboard_actividad_proyectos', { p_inicio: inicio, p_fin: fin })
  if (error) throw error
  return data as { creados: number; en_curso: number }
}

async function getDashboardCotizacionesRecientes(): Promise<CotizacionReciente[]> {
  const { data, error } = await supabaseAdmin.rpc('dashboard_cotizaciones_recientes')
  if (error) throw error
  return data as CotizacionReciente[]
}

export async function getResumenDashboard({
  periodo,
  fecha,
}: {
  periodo: PeriodoDashboard
  fecha?: string
}): Promise<ResumenDashboard> {
  const anchor = parseAnchor(fecha)
  const periodoActual = rangoDePeriodo(periodo, anchor, 0)
  const buckets = bucketsDePeriodo(periodo, anchor, 6)
  const rangoInicioTotal = buckets[0].inicio

  const [
    kpisCuentasR,
    egresosPorBucketR,
    pagosR,
    actividadCotizacionesR,
    actividadProyectosR,
    gastosFijosR,
    cotizacionesRecientesR,
  ] = await Promise.allSettled([
    getDashboardKpisCuentas(),
    getDashboardEgresosPorBucket(buckets),
    getPagosComprobantesEnRango(rangoInicioTotal, periodoActual.fin),
    getDashboardActividadCotizaciones(periodoActual.inicio, periodoActual.fin),
    getDashboardActividadProyectos(periodoActual.inicio, periodoActual.fin),
    getGastosFijos(true),
    getDashboardCotizacionesRecientes(),
  ])

  const fuentesConError: string[] = []
  const kpisCuentas = resuelto(fuentesConError, 'Cuentas por cobrar/pagar', kpisCuentasR, { por_cobrar: 0, por_pagar: 0 })
  const egresosPorBucket = resuelto(fuentesConError, 'Egresos por periodo', egresosPorBucketR, buckets.map(() => 0))
  const pagos = resuelto(fuentesConError, 'Pagos', pagosR, [])
  const actividadCotizaciones = resuelto(fuentesConError, 'Cotizaciones', actividadCotizacionesR, { aprobadas: 0, borrador: 0 })
  const actividadProyectos = resuelto(fuentesConError, 'Proyectos', actividadProyectosR, { creados: 0, en_curso: 0 })
  const gastosFijosActivos = resuelto(fuentesConError, 'Gastos fijos', gastosFijosR, [])
  const cotizacionesRecientes = resuelto(fuentesConError, 'Cotizaciones recientes', cotizacionesRecientesR, [])

  const balance = buckets.map((b, i) => ({
    label: b.label,
    ingresos: round2(
      pagos.filter((p) => enRango(p.fecha_pago, b.inicio, b.fin)).reduce((sum, p) => sum + Number(p.monto || 0), 0)
    ),
    egresos: egresosPorBucket[i] ?? 0,
  }))

  const actualBalance = balance[balance.length - 1]
  const ingresos = actualBalance.ingresos
  const egresos = actualBalance.egresos
  const utilidadAntesIsr = round2(ingresos - egresos)
  const impuestos = round2(Math.max(0, utilidadAntesIsr) * TASA_ISR_PERSONA_MORAL)

  const porCobrar = kpisCuentas.por_cobrar
  const deudas = kpisCuentas.por_pagar

  const cotizacionesAprobadas = actividadCotizaciones.aprobadas
  const cotizacionesBorrador = actividadCotizaciones.borrador

  const proyectosCreados = actividadProyectos.creados
  const proyectosEnCurso = actividadProyectos.en_curso

  const totalGastosFijos = round2(gastosFijosActivos.reduce((sum, g) => sum + Number(g.monto_mensual || 0), 0))

  return {
    periodo,
    periodoActual,
    kpis: { porCobrar, porPagar: deudas, cotizacionesAprobadas, cotizacionesBorrador },
    balance,
    fiscal: { ingresos, egresos, impuestos, deudas, utilidadAntesIsr },
    cobertura: {
      gastosFijos: gastosFijosActivos.map((g) => ({ id: g.id, nombre: g.nombre, monto: Number(g.monto_mensual) })),
      totalGastosFijos,
      facturado: ingresos,
    },
    actividad: { proyectosCreados, cotizacionesAprobadas, proyectosEnCurso },
    cotizacionesRecientes,
    fuentesConError,
  }
}
