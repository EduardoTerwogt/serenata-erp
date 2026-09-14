import { requireSection } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

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

    return Response.json({ proyectos: data })
  } catch (error) {
    console.error('[cuentas/por-proyecto][GET]', error)
    return Response.json({ error: 'Error agrupando cuentas por proyecto' }, { status: 500 })
  }
}
