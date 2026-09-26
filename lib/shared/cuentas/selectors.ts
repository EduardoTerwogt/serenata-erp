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

/**
 * Bloque 6 (docs/PLAN.md): colapsa los items de cuentas_pagar de un
 * proyecto (ya cargados completos por useCuentasPorProyecto, sin
 * paginación) en una fila por grupo/responsable -- mismo resultado visual
 * que buscar_cuentas_pagar_grupos() en la vista "Lista", pero calculado en
 * JS porque aquí no hay una nueva RPC paginada. El id expuesto es el del
 * item representante (el más antiguo del grupo) para que abrir la fila siga
 * usando el detalle existente sin cambios. Una cuenta sin grupo_id (legacy)
 * se devuelve tal cual, sin agrupar con nada.
 */
export function agruparCuentasPagarPorGrupo(cuentas: CuentaPagar[]): CuentaPagar[] {
  const porGrupo = new Map<string, CuentaPagar[]>()
  for (const cuenta of cuentas) {
    const key = cuenta.grupo_id ?? cuenta.id
    porGrupo.set(key, [...(porGrupo.get(key) ?? []), cuenta])
  }

  return Array.from(porGrupo.values()).map((items) => {
    if (items.length === 1 && !items[0].grupo_id) return items[0]

    const representante = [...items].sort(
      (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id)
    )[0]

    return {
      ...representante,
      estado: representante.grupo_estado ?? representante.estado,
      x_pagar: representante.grupo_monto_total ?? items.reduce((sum, item) => sum + (item.x_pagar || 0), 0),
      monto_pagado: representante.grupo_monto_pagado ?? items.reduce((sum, item) => sum + (item.monto_pagado || 0), 0),
      items_count: items.length,
    }
  })
}
