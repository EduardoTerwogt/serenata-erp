import { requireSection } from '@/lib/api-auth'
import { derivarAvisos } from '@/lib/server/cuentas/avisos'
import { cargarAniosCuentas, cargarCuentasAnio } from '@/lib/server/cuentas/periodo-rpc'
import { construirProyectos, pendientesPorAnio } from '@/lib/server/cuentas/periodo'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import type { ProyectoDetalle, ResumenRespuesta } from '@/lib/shared/cuentas/periodo-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'

const ROUTE = 'GET /api/cuentas/resumen'

/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, S4): años con su número de proyectos
 * pendientes (select de periodo) y el contador de avisos, derivados sobre
 * todos los años. El cliente la pide una vez por carga.
 */
export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const hoy = hoyCdmx()
    const anios = await cargarAniosCuentas()
    const porAnio = await Promise.all(anios.map(async (anio) => ({ anio, proyectos: construirProyectos(await cargarCuentasAnio(anio), hoy) })))

    // "Sin fecha" y "Sin proyecto" llegan en cada año: se cuentan una sola vez.
    const vistos = new Set<string>()
    const todos: ProyectoDetalle[] = []
    for (const { proyectos } of porAnio) {
      for (const p of proyectos) {
        if (vistos.has(p.id)) continue
        vistos.add(p.id)
        todos.push(p)
      }
    }

    const body: ResumenRespuesta = {
      hoy,
      anios: porAnio.map(({ anio, proyectos }) => ({ anio, pendientes: pendientesPorAnio(proyectos, anio) })),
      avisos: derivarAvisos(todos, hoy).total,
    }
    return Response.json(body)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
