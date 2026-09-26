import { totalesOrden } from '@/lib/shared/cuentas/orden-cruce'
import type { PreviewOrden } from '@/lib/shared/cuentas/ordenes-tipos'

/** Resumen de la tarjeta "Nueva orden": todo lo elegible. */
export function totalesPreviewCliente(preview: PreviewOrden) {
  const t = totalesOrden(preview)
  return { cuentas: t.cuentas, responsables: t.responsables, total: t.cruce.total }
}
