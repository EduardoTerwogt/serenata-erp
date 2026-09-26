import type { MesPeriodo } from '@/lib/shared/cuentas/periodo-tipos'

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "18 sep 2026" */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return `${iso.slice(8, 10)} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/** "Septiembre 2026" o "Todo 2026". */
export function etiquetaPeriodo(anio: number, mes: MesPeriodo): string {
  return mes === 'todo' ? `Todo ${anio}` : `${MESES_LARGOS[mes - 1]} ${anio}`
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
