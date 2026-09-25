import { requireSection } from '@/lib/api-auth'
import { cargarCuentasAnio, cargarPeriodo } from '@/lib/server/cuentas/periodo-rpc'
import { construirProyectos, seleccionarProyecto } from '@/lib/server/cuentas/periodo'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { crearTiempos } from '@/lib/server/server-timing'
import { CuentasPeriodoQuerySchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'GET /api/cuentas/periodo'

/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, O1, O1b, D12, S17): un periodo de
 * Cuentas (año + mes o "Todo el año") ya derivado, filtrado, contado y
 * paginado. La derivación del periodo corre en SQL (`cuentas_periodo`, O1b):
 * el año crudo pesaba ~4 MB y moverlo a Node rompía el presupuesto. El
 * proyecto seleccionado (conceptos, cierre y cierre mensual) se arma en TS
 * sobre la lectura cruda de ese solo proyecto. Solo lee: el estado "Vencido"
 * guardado lo actualiza el cron (O2), no esta ruta.
 */
export async function GET(request: Request) {
  const t = crearTiempos()
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response
  t.marcar('auth')

  const params = Object.fromEntries(
    Array.from(new URL(request.url).searchParams.entries()).filter(([, v]) => v.trim() !== '')
  )
  const validation = validate(CuentasPeriodoQuerySchema, params)
  if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })

  try {
    const hoy = hoyCdmx()
    const { proyecto, ...filtros } = validation.data
    const anio = filtros.anio ?? Number(hoy.slice(0, 4))
    const [periodo, seleccionado] = await Promise.all([
      cargarPeriodo({ ...filtros, anio }, hoy),
      proyecto
        ? cargarCuentasAnio(anio, proyecto).then((crudo) => seleccionarProyecto(construirProyectos(crudo, hoy), { ...filtros, proyecto }))
        : null,
    ])
    t.marcar('rpc')
    return t.responder({ ...periodo, seleccionado })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
