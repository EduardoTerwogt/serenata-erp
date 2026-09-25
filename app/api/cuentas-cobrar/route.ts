import { requireSection } from '@/lib/api-auth'
import { buscarCuentasCobrar } from '@/lib/db'

// EF-3 3B-2: busqueda/paginacion/totales server-side via RPC unica
// buscar_cuentas_cobrar (db/migrations/20260914_buscar_cuentas_cobrar.sql),
// que ya llama sync_estados_cuentas_cobrar_vencidas() (3B-1) internamente
// -- esta ruta ya no la invoca por su cuenta (evitaba un UPDATE completo
// de la tabla ejecutado de mas en cada GET).
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const page = Number(searchParams.get('page')) || 1
    const pageSize = Number(searchParams.get('pageSize')) || 50
    const result = await buscarCuentasCobrar(search, page, pageSize)
    return Response.json(result)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cuentas por cobrar' }, { status: 500 })
  }
}

// PUT retirado en B1b (docs/PLAN.md, H4): aceptaba estado/montos u
// orden_pago_id directos, sin Zod ni RPC, y la UI no lo usaba. Toda
// transición financiera va por su endpoint explícito.
