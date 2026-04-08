export function fmtCurrency(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatSpanishLongDate(dateValue?: string | null) {
  if (!dateValue) return '—'

  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const parts = dateValue.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateValue

  return `${parts[2]} de ${meses[parts[1] - 1]} ${parts[0]}`
}

export function formatTodaySpanishLongDate() {
  const d = new Date()
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`
}
