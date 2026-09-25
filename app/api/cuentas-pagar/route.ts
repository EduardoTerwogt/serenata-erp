import { requireSection } from '@/lib/api-auth'
import { buscarCuentasPagarGrupos } from '@/lib/db'

// Bloque 6 (docs/PLAN.md): busqueda/paginacion/totales server-side via RPC
// unica buscar_cuentas_pagar_grupos
// (db/migrations/20260918_buscar_cuentas_pagar_grupos.sql) -- una fila por
// grupo/responsable, no por item.
export async function GET(request: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const page = Number(searchParams.get('page')) || 1
    const pageSize = Number(searchParams.get('pageSize')) || 50
    const result = await buscarCuentasPagarGrupos(search, page, pageSize)
    return Response.json(result)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo cuentas por pagar' }, { status: 500 })
  }
}

// PUT retirado en B1b (docs/PLAN.md, H4): aceptaba estado/montos u
// orden_pago_id directos, sin Zod ni RPC, y la UI no lo usaba. Toda
// transición financiera va por su endpoint explícito.
