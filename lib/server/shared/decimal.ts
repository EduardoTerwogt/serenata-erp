/**
 * Redondeo financiero a 2 decimales, decimal-seguro -- opera sobre la
 * representación en string del valor (no sobre el float multiplicado), para
 * evitar el error de representación de punto flotante que hace que
 * `Math.round(n * 100) / 100` y `Number(n.toFixed(2))` diverjan de
 * `ROUND(numeric, 2)` de Postgres en casos como 100.005 (Postgres redondea a
 * 100.01; ambos atajos de JS dan 100.00). Postgres/`numeric`/`ROUND` es la
 * política canónica (EF-3 3B-1) -- esta función es el equivalente JS
 * decimal-seguro, usado donde el cliente necesita paridad exacta con una RPC.
 */
export function round2(value: number): number {
  const sign = value < 0 ? -1 : 1
  const [intPart, fracPart = ''] = Math.abs(value).toString().split('.')
  if (fracPart.length <= 2) return sign * Number(`${intPart}.${fracPart.padEnd(2, '0')}`)
  const roundUp = fracPart.charCodeAt(2) - 48 >= 5
  const base = Number(`${intPart}${fracPart.slice(0, 2)}`) + (roundUp ? 1 : 0)
  return sign * (base / 100)
}
