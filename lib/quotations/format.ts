export function fmtCurrency(n: number) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Moneda con `$` y 2 decimales (Rediseño de Cuentas, S20; supuesto 18). El signo va antes del `$`. */
export function fmtMoney(n: number) {
  const valor = Number(n) || 0
  return `${valor < 0 ? '-' : ''}$${fmtCurrency(Math.abs(valor))}`
}
