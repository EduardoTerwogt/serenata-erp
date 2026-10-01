// Rediseño de Cuentas B1 (docs/PLAN.md, S6): vive en lib/shared para que
// la derivación de conceptos (concepto.ts) la use igual en servidor y
// cliente. "Hoy" es la fecha de negocio en CDMX, nunca la UTC del servidor.
import { round2 } from '@/lib/shared/decimal'

export function calcularSaldoPendiente(total: number, pagado: number | null | undefined): number {
  const saldo = Number(total || 0) - Number(pagado || 0)
  return saldo > 0 ? round2(saldo) : 0
}
