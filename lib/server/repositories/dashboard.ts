import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { getCotizaciones } from '@/lib/server/repositories/quotations'
import { getProyectos } from '@/lib/server/repositories/proyectos'
import { getCuentasCobrar, getPagosComprobantesEnRango } from '@/lib/server/repositories/cuentas-cobrar'
import { getCuentasPagar } from '@/lib/server/repositories/cuentas-pagar'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'
import { round2 } from '@/lib/server/shared/decimal'
import { Cotizacion, CuentaPagar, GastoFijo } from '@/lib/types'

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

/**
 * Egresos por mes = suma de x_pagar de cuentas_pagar totalmente liquidadas
 * (estado PAGADO) cuya fecha_pago cae en el rango. Limitación conocida y
 * documentada (ver 20260905_atomic_registrar_pago_cuenta_pagar.sql):
 * cuentas_pagar no tiene ledger de abonos -- fecha_pago solo se graba al
 * llegar a PAGADO completo, así que un abono parcial suelto no cuenta aquí
 * hasta que la cuenta se liquide del todo. No se resuelve en esta fase.
 */
function sumarEgresosEnRango(cuentasPagar: CuentaPagar[], inicio: string, fin: string): number {
  return round2(
    cuentasPagar
      .filter((c) => c.estado === 'PAGADO' && enRango(c.fecha_pago, inicio, fin))
      .reduce((sum, c) => sum + Number(c.x_pagar || 0), 0)
  )
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

  const [cuentasCobrarR, cuentasPagarR, cotizacionesR, proyectosR, gastosFijosR, pagosR] = await Promise.allSettled([
    getCuentasCobrar(),
    getCuentasPagar(),
    getCotizaciones(),
    getProyectos(),
    getGastosFijos(true),
    getPagosComprobantesEnRango(rangoInicioTotal, periodoActual.fin),
  ])

  const fuentesConError: string[] = []
  const cuentasCobrar = resuelto(fuentesConError, 'Cuentas por cobrar', cuentasCobrarR, [])
  const cuentasPagar = resuelto(fuentesConError, 'Cuentas por pagar', cuentasPagarR, [])
  const cotizaciones = resuelto(fuentesConError, 'Cotizaciones', cotizacionesR, [])
  const proyectos = resuelto(fuentesConError, 'Proyectos', proyectosR, [])
  const gastosFijosActivos = resuelto(fuentesConError, 'Gastos fijos', gastosFijosR, [])
  const pagos = resuelto(fuentesConError, 'Pagos', pagosR, [])

  const balance = buckets.map((b) => ({
    label: b.label,
    ingresos: round2(
      pagos.filter((p) => enRango(p.fecha_pago, b.inicio, b.fin)).reduce((sum, p) => sum + Number(p.monto || 0), 0)
    ),
    egresos: sumarEgresosEnRango(cuentasPagar, b.inicio, b.fin),
  }))

  const actualBalance = balance[balance.length - 1]
  const ingresos = actualBalance.ingresos
  const egresos = actualBalance.egresos
  const utilidadAntesIsr = round2(ingresos - egresos)
  const impuestos = round2(Math.max(0, utilidadAntesIsr) * TASA_ISR_PERSONA_MORAL)

  const porCobrar = round2(
    cuentasCobrar
      .filter((c) => c.estado !== 'PAGADO')
      .reduce((sum, c) => sum + calcularSaldoPendiente(c.monto_total, c.monto_pagado), 0)
  )
  const deudas = round2(
    cuentasPagar
      .filter((c) => c.estado !== 'PAGADO')
      .reduce((sum, c) => sum + calcularSaldoPendiente(c.x_pagar, c.monto_pagado), 0)
  )

  const cotizacionesEnPeriodo = cotizaciones.filter((c) => enRango(c.created_at, periodoActual.inicio, periodoActual.fin))
  const cotizacionesAprobadas = cotizacionesEnPeriodo.filter((c) => c.estado === 'APROBADA').length
  const cotizacionesBorrador = cotizacionesEnPeriodo.filter((c) => c.estado === 'BORRADOR').length

  const proyectosCreados = proyectos.filter((p) => enRango(p.created_at, periodoActual.inicio, periodoActual.fin)).length
  const proyectosEnCurso = proyectos.filter(
    (p) => !!p.fecha_inicio_real && p.fecha_inicio_real < periodoActual.inicio && !p.fecha_cierre_real
  ).length

  const totalGastosFijos = round2(gastosFijosActivos.reduce((sum, g) => sum + Number(g.monto_mensual || 0), 0))

  const cotizacionesRecientes = [...cotizaciones]
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 6)
    .map((c) => ({ id: c.id, proyecto: c.proyecto, cliente: c.cliente, total: c.total, estado: c.estado, created_at: c.created_at }))

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
