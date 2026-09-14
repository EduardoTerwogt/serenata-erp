import { CuentaCobrar, CuentaPagar } from '@/lib/types'

type MonetaryCuenta = Pick<CuentaCobrar, 'monto_total' | 'monto_pagado'>
type MonetaryCuentaPagar = Pick<CuentaPagar, 'x_pagar' | 'monto_pagado'>

function getMontoPendiente(cuenta: MonetaryCuenta | MonetaryCuentaPagar) {
  const total = 'monto_total' in cuenta ? cuenta.monto_total : cuenta.x_pagar
  return Math.max(0, total - Number(cuenta.monto_pagado || 0))
}

// EF-3 3B-2/3B-3: usada por CuentasPorProyecto (grupos por proyecto,
// siempre client-side) -- las listas de Cuentas/Cobrar y Cuentas/Pagar en
// vista "Lista" ya no filtran/suman en JS, eso vive en las RPCs
// buscar_cuentas_cobrar/buscar_cuentas_pagar.
export function sumMontoPendiente<T extends MonetaryCuenta | MonetaryCuentaPagar>(cuentas: T[]) {
  return cuentas.reduce((sum, cuenta) => sum + getMontoPendiente(cuenta), 0)
}
