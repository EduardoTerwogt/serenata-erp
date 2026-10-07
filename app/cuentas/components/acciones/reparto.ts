/**
 * #123 (B4, T6): reparto de un pago entre cuentas, en centavos enteros y solo para pintar. El cliente nunca decide
 * estados ni umbrales: la RPC revalida todo bajo lock. Aquí solo se calcula lo que ve el usuario (aplicado, por
 * aplicar, qué línea pasa de su saldo) y la sugerencia "la más antigua primero" (P8) sobre la lista que SQL ya
 * entrega ordenada (de la cotización más antigua a la más reciente).
 */

export const aCentavos = (n: number): number => Math.round(n * 100)
export const deCentavos = (c: number): number => c / 100

/** "1,234.50" → 123450. Vacío o inválido → null. Más de dos decimales → null (no se redondea en silencio). */
export function parseMonto(texto: string): number | null {
  const limpio = texto.replace(/[,\s$]/g, '')
  if (!/^\d*\.?\d*$/.test(limpio) || limpio === '' || limpio === '.') return null
  const [, dec = ''] = limpio.split('.')
  if (dec.length > 2) return null
  return Math.round(Number(limpio) * 100)
}

/** 123450 → "1234.50" (lo que se pone en un campo de monto). */
export const textoMonto = (centavos: number): string => (centavos / 100).toFixed(2)

export interface LineaReparto {
  id: string
  /** Saldo pendiente de la cuenta, en centavos. */
  saldo: number
}

/** Reparte `monto` recorriendo las líneas en el orden dado; cada una recibe hasta su saldo. */
export function sugerirReparto(monto: number, lineas: LineaReparto[]): Record<string, number> {
  const aplicado: Record<string, number> = {}
  let resto = Math.max(0, monto)
  for (const l of lineas) {
    const a = Math.max(0, Math.min(l.saldo, resto))
    if (a > 0) aplicado[l.id] = a
    resto -= a
  }
  return aplicado
}

export interface ResumenReparto {
  /** Suma de lo aplicado (centavos). */
  aplicado: number
  /** Monto del pago menos lo aplicado: > 0 falta aplicar, < 0 se aplicó de más. */
  porAplicar: number
  /** Ids de líneas cuyo monto pasa de su saldo. */
  excedidas: string[]
  /** Líneas con monto > 0. */
  lineas: number
}

export function resumirReparto(monto: number, aplicado: Record<string, number>, lineas: LineaReparto[]): ResumenReparto {
  let suma = 0
  let n = 0
  const excedidas: string[] = []
  for (const l of lineas) {
    const a = aplicado[l.id] ?? 0
    if (a > 0) n++
    suma += a
    if (a > l.saldo) excedidas.push(l.id)
  }
  return { aplicado: suma, porAplicar: monto - suma, excedidas, lineas: n }
}
