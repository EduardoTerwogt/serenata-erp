const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/**
 * Formatea una fecha para mostrar en UI/PDFs como "04-Sep-2026".
 * Acepta un string ISO (yyyy-mm-dd o yyyy-mm-ddTHH:MM:SS...) o un Date.
 * Para strings, extrae año/mes/día del texto directamente (split, sin pasar por
 * `new Date(...)`) — evita el corrimiento de zona horaria (new Date("2026-09-04")
 * se interpreta como medianoche UTC y puede mostrar el día anterior en zonas UTC
 * negativas) y evita mismatches de hidratación SSR/cliente en Next.js (el server
 * de Vercel corre en UTC, el browser del usuario en su zona local).
 * Solo usar el parámetro Date para "hoy" (new Date() al momento de renderizar) —
 * nunca hacer `formatDateDisplay(new Date(isoString))`, reintroduce el mismo bug.
 */
export function formatDateDisplay(value: string | Date | null | undefined): string {
  if (!value) return '—'

  let year: number
  let month: number
  let day: number

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—'
    year = value.getFullYear()
    month = value.getMonth() + 1
    day = value.getDate()
  } else {
    const [y, m, d] = value.split('T')[0].split('-').map(Number)
    if (!y || !m || !d) return '—'
    year = y
    month = m
    day = d
  }

  const mes = MESES_ABREV[month - 1]
  if (!mes) return '—'

  return `${String(day).padStart(2, '0')}-${mes}-${year}`
}
