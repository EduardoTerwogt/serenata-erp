import { requireSection } from '@/lib/api-auth'
import { cargarCuentasAnio } from '@/lib/server/cuentas/periodo-rpc'
import { construirPeriodo, construirProyectos, ultimoMesConDatos } from '@/lib/server/cuentas/periodo'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { crearTiempos } from '@/lib/server/server-timing'
import { CuentasPeriodoQuerySchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'GET /api/cuentas/periodo'

/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, O1, D12, S17): un periodo de Cuentas
 * (año + mes o "Todo el año") ya derivado, filtrado, contado y paginado. Solo
 * lee: el estado "Vencido" guardado lo actualiza el cron (O2), no esta ruta.
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
    const anio = validation.data.anio ?? Number(hoy.slice(0, 4))
    const crudo = await cargarCuentasAnio(anio)
    t.marcar('rpc')
    const proyectos = construirProyectos(crudo, hoy)
    // S16: sin mes, el actual si es el año en curso; si no, el último mes con datos.
    const mes = validation.data.mes ?? (anio === Number(hoy.slice(0, 4)) ? Number(hoy.slice(5, 7)) : ultimoMesConDatos(proyectos, anio))
    const periodo = construirPeriodo(proyectos, { ...validation.data, anio, mes }, hoy)
    t.marcar('derivar')
    return t.responder(periodo)
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
