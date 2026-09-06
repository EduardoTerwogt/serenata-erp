import { requireSection } from '@/lib/api-auth'
import { getCuentasPagar, getHistorialCambiosResponsableByItem } from '@/lib/db'

// Historial de reasignaciones de responsable para la partida detrás de esta
// cuenta por pagar (historial_cambios_responsable_item, log append-only,
// Bloque 1). Las cuentas creadas antes de que existiera item_id (legado, ver
// fallback en items/[id]/route.ts) no tienen partida ligada -- devuelven
// historial vacío, no es un error.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const cuentas = await getCuentasPagar()
    const cuenta = cuentas.find(c => c.id === id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    }

    if (!cuenta.item_id) {
      return Response.json({ historial: [] })
    }

    const historial = await getHistorialCambiosResponsableByItem(cuenta.item_id)
    return Response.json({ historial })
  } catch (error) {
    console.error('[cuentas-pagar/historial-responsable][GET]', error)
    return Response.json({ error: 'Error obteniendo historial de responsable' }, { status: 500 })
  }
}
