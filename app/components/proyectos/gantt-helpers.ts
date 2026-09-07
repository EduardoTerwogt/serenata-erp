// Helpers puros para el componente Gantt (Fase 5.2 Bloque 3). Todas las
// fechas se manejan como strings 'YYYY-MM-DD' y se parsean con Date.UTC
// (nunca `new Date(isoString)` a secas) para evitar el corrimiento de zona
// horaria documentado en lib/format-date.ts -- aquí importa doblemente
// porque se usa para posicionar barras, no solo para mostrar texto.

import { toneForTareaEstado } from '@/components/ui/StatusBadge'
import type { ProyectoTarea } from '@/lib/types'
import type { GanttRow } from './Gantt'

export interface DateRange {
  startISO: string
  endISO: string
}

function toUtcDay(dateISO: string): number {
  const [y, m, d] = dateISO.split('T')[0].split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000
}

function fromUtcDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10)
}

export function daysBetween(aISO: string, bISO: string): number {
  return toUtcDay(bISO) - toUtcDay(aISO)
}

const MIN_RANGE_DAYS = 6

/**
 * Rango visible del Gantt a partir de un conjunto de fechas -- min/max con
 * un pequeño padding a cada lado para que las barras de los extremos no
 * queden pegadas al borde. Si solo hay una fecha (o ninguna), se genera un
 * rango mínimo alrededor de ella (o de hoy).
 */
export function computeRange(dates: string[]): DateRange {
  const validas = dates.filter(Boolean)
  if (validas.length === 0) {
    const hoy = new Date().toISOString().slice(0, 10)
    const hoyDay = toUtcDay(hoy)
    return { startISO: fromUtcDay(hoyDay - 3), endISO: fromUtcDay(hoyDay + 3) }
  }

  const dias = validas.map(toUtcDay)
  let minDay = Math.min(...dias)
  let maxDay = Math.max(...dias)

  if (maxDay - minDay < MIN_RANGE_DAYS) {
    const centro = (minDay + maxDay) / 2
    minDay = Math.floor(centro - MIN_RANGE_DAYS / 2)
    maxDay = Math.ceil(centro + MIN_RANGE_DAYS / 2)
  }

  const padding = Math.max(1, Math.round((maxDay - minDay) * 0.08))
  return { startISO: fromUtcDay(minDay - padding), endISO: fromUtcDay(maxDay + padding) }
}

export function percentForDate(dateISO: string, range: DateRange): number {
  const total = daysBetween(range.startISO, range.endISO)
  if (total <= 0) return 0
  const offset = daysBetween(range.startISO, dateISO)
  return Math.min(100, Math.max(0, (offset / total) * 100))
}

const FALLBACK_WIDTH_PCT = 8

/**
 * Calcula left/width (%) de una barra. Si hay fecha de inicio y es anterior
 * a la de fin, la barra va de inicio a fin. Si no (falta el inicio, o el
 * inicio es posterior al fin -- dato inconsistente), se dibuja un marcador
 * de ancho fijo terminando en la fecha de fin, en vez de omitir la tarea.
 */
export function computeBarSpan(
  startISO: string | null,
  endISO: string,
  range: DateRange,
  fallbackWidthPct: number = FALLBACK_WIDTH_PCT
): { leftPct: number; widthPct: number } {
  const endPct = percentForDate(endISO, range)

  if (startISO && daysBetween(startISO, endISO) > 0) {
    const startPct = percentForDate(startISO, range)
    return { leftPct: startPct, widthPct: Math.max(1, endPct - startPct) }
  }

  const leftPct = Math.max(0, endPct - fallbackWidthPct)
  return { leftPct, widthPct: Math.min(fallbackWidthPct, endPct - leftPct) || 1 }
}

export function computeTodayPercent(range: DateRange, todayISO?: string): number | null {
  const hoy = todayISO ?? new Date().toISOString().slice(0, 10)
  if (daysBetween(range.startISO, hoy) < 0 || daysBetween(hoy, range.endISO) < 0) return null
  return percentForDate(hoy, range)
}

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function formatShort(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  void y
  return `${String(d).padStart(2, '0')} ${MESES_ABREV[(m || 1) - 1]}`
}

/**
 * Etiquetas de regla del Gantt -- divide el rango en tramos iguales
 * (máximo `maxLabels`), cada uno con su ancho porcentual correspondiente.
 */
export function buildRulerLabels(range: DateRange, maxLabels = 7): { label: string; widthPct: number }[] {
  const totalDias = daysBetween(range.startISO, range.endISO)
  if (totalDias <= 0) return [{ label: formatShort(range.startISO), widthPct: 100 }]

  const tramos = Math.min(maxLabels, Math.max(1, totalDias))
  const widthPct = 100 / tramos
  const inicioDay = toUtcDay(range.startISO)

  return Array.from({ length: tramos }, (_, i) => {
    const dia = fromUtcDay(Math.round(inicioDay + (totalDias * i) / tramos))
    return { label: formatShort(dia), widthPct }
  })
}

export interface GanttTareasResult {
  rows: GanttRow[]
  rulerLabels: { label: string; widthPct: number }[]
  todayPct: number | null
}

/**
 * Construye las filas del Gantt de un proyecto a partir de sus tareas.
 * Tareas sin fecha_limite se omiten (no hay dónde ubicarlas) -- mismo
 * caveat que declara el preview aprobado. La barra va de created_at a
 * fecha_limite cuando el rango tiene sentido; si no, computeBarSpan cae en
 * un marcador de ancho fijo (ver decisión 7 del plan de Bloque 3).
 */
export function buildGanttRowsFromTareas(tareas: ProyectoTarea[]): GanttTareasResult {
  const conFecha = tareas.filter((t): t is ProyectoTarea & { fecha_limite: string } => Boolean(t.fecha_limite))

  if (conFecha.length === 0) {
    return { rows: [], rulerLabels: [], todayPct: null }
  }

  const range = computeRange(conFecha.flatMap((t) => [t.created_at.slice(0, 10), t.fecha_limite]))

  const rows: GanttRow[] = conFecha.map((tarea) => {
    const tone = toneForTareaEstado(tarea.estado)
    const startISO = tarea.created_at ? tarea.created_at.slice(0, 10) : null
    const span = computeBarSpan(startISO, tarea.fecha_limite, range)

    return {
      id: tarea.id,
      label: tarea.titulo,
      bars: [{ leftPct: span.leftPct, widthPct: span.widthPct, tone, label: tarea.titulo }],
      hitoPct: tarea.es_hito ? percentForDate(tarea.fecha_limite, range) : undefined,
      hitoTone: tarea.es_hito ? tone : undefined,
    }
  })

  return { rows, rulerLabels: buildRulerLabels(range), todayPct: computeTodayPercent(range) }
}
