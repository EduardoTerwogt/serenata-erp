import { requireSection } from '@/lib/api-auth'
import { derivarAvisos } from '@/lib/server/cuentas/avisos'
import { cargarAniosCuentas, cargarCuentasAnio } from '@/lib/server/cuentas/periodo-rpc'
import { construirProyectos } from '@/lib/server/cuentas/periodo'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { crearTiempos } from '@/lib/server/server-timing'
import type { ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'

const ROUTE = 'GET /api/cuentas/avisos'

/**
 * Rediseño de Cuentas B6 (docs/PLAN.md, supuestos 2 y 3, D25, D27, S4): las
 * 5 categorías de avisos sobre todos los años, derivadas con concepto.ts
 * igual que la lista. "Sin fecha" y "Sin proyecto" llegan en cada año y se
 * cuentan una sola vez.
 */
export async function GET() {
  const t = crearTiempos()
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response
  t.marcar('auth')

  try {
    const hoy = hoyCdmx()
    const anios = await cargarAniosCuentas()
    const crudos = await Promise.all(anios.map((anio) => cargarCuentasAnio(anio)))
    t.marcar('rpc')
    const vistos = new Set<string>()
    const todos: ProyectoDetalle[] = []
    for (const crudo of crudos) {
      for (const p of construirProyectos(crudo, hoy)) {
        if (vistos.has(p.id)) continue
        vistos.add(p.id)
        todos.push(p)
      }
    }
    const avisos = derivarAvisos(todos, hoy)
    t.marcar('derivar')
    return t.responder(avisos)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
