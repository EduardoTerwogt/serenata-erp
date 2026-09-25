export function formatCuentasCurrency(value: number) {
  return (value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

// Rediseño de Cuentas B1 (docs/PLAN.md, S6): movido a lib/shared/cuentas/cruce.ts.
// Re-export hasta B8.
export { calcularCrucePagoProveedor } from '@/lib/shared/cuentas/cruce'
export type { CrucePagoProveedor } from '@/lib/shared/cuentas/cruce'
