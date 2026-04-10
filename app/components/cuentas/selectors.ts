import { CuentaCobrar, CuentaPagar } from '@/lib/types'
import { SelectedCuenta } from '@/app/components/cuentas/types'

type MonetaryCuenta = Pick<CuentaCobrar, 'monto_total' | 'monto_pagado'>
type MonetaryCuentaPagar = Pick<CuentaPagar, 'x_pagar' | 'monto_pagado'>

export function getCuentaSearchTerm(value: string) {
  return value.toLowerCase().trim()
}

function includesSearchValue(value: string | null | undefined, term: string) {
  return (value || '').toLowerCase().includes(term)
}

export function buildCobrarRows(cuentas: CuentaCobrar[]): SelectedCuenta[] {
  return cuentas.map((cuenta) => ({ ...cuenta, tipo: 'cobrar' as const }))
}

export function buildPagarRows(cuentas: CuentaPagar[]): SelectedCuenta[] {
  return cuentas.map((cuenta) => ({ ...cuenta, tipo: 'pagar' as const }))
}

export function filterCobrarRows(cuentas: SelectedCuenta[], term: string) {
  if (!term) return cuentas

  return cuentas.filter((cuenta) =>
    cuenta.tipo === 'cobrar' &&
    (
      includesSearchValue(cuenta.cotizacion_id, term) ||
      includesSearchValue(cuenta.folio, term) ||
      includesSearchValue(cuenta.cliente, term) ||
      includesSearchValue(cuenta.proyecto, term)
    )
  )
}

export function filterPagarRows(cuentas: SelectedCuenta[], term: string) {
  if (!term) return cuentas

  return cuentas.filter((cuenta) =>
    cuenta.tipo === 'pagar' &&
    (
      includesSearchValue(cuenta.cotizacion_id, term) ||
      includesSearchValue(cuenta.folio, term) ||
      includesSearchValue(cuenta.responsable_nombre, term) ||
      includesSearchValue(cuenta.proyecto_nombre, term) ||
      includesSearchValue(cuenta.item_descripcion, term)
    )
  )
}

export function countPendingCuentas<T extends { estado: string }>(cuentas: T[]) {
  return cuentas.filter((cuenta) => cuenta.estado !== 'PAGADO').length
}

function getMontoPendiente(cuenta: MonetaryCuenta | MonetaryCuentaPagar) {
  const total = 'monto_total' in cuenta ? cuenta.monto_total : cuenta.x_pagar
  return Math.max(0, total - Number(cuenta.monto_pagado || 0))
}

export function sumMontoPendiente<T extends MonetaryCuenta | MonetaryCuentaPagar>(cuentas: T[]) {
  return cuentas.reduce((sum, cuenta) => sum + getMontoPendiente(cuenta), 0)
}

export function sumMontoPagado<T extends { monto_pagado: number | null }>(cuentas: T[]) {
  return cuentas.reduce((sum, cuenta) => sum + Number(cuenta.monto_pagado || 0), 0)
}
