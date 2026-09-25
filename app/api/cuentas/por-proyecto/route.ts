import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { calcularCierreProyecto } from '@/lib/shared/cierre-proyecto'
import type { ProyectoConCuentasRPC } from '@/lib/types'

// EF-3 3B-9: agrupamiento/suma movidos a SQL vía la RPC cuentas_por_proyecto
// (db/migrations/20260914_cuentas_por_proyecto.sql) -- antes traía
// proyectos+cuentas_cobrar+cuentas_pagar completos y agregaba en Node.
// Vista "Por proyecto" de CuentasScreen.jsx: acordeón por proyecto con sus
// cuentas por cobrar y por pagar. Shape de respuesta sin cambios
// ({ proyectos: [{proyecto, cuentas_cobrar, cuentas_pagar, total_cobrar,
// total_pagar}] }), verificado en vivo contra serenata-erp-test con
// paridad exacta (conteo, totales, orden externo e interno) contra el
// agregado en Node anterior.
export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { data, error } = await supabaseAdmin.rpc('cuentas_por_proyecto')
    if (error) throw error

    const proyectos = (data as ProyectoConCuentasRPC[]).map((p) => ({
      ...p,
      cierre: calcularCierreProyecto(p.cuentas_pagar, p.margen_total_proyecto, p.fee_agencia_proyecto, p.iva_total_proyecto),
    }))

    return Response.json({ proyectos })
  } catch (error) {
    console.error('[cuentas/por-proyecto][GET]', error)
    return Response.json({ error: 'Error agrupando cuentas por proyecto' }, { status: 500 })
  }
}
