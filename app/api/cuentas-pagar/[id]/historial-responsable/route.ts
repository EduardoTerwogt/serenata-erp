import { requireSection } from '@/lib/api-auth'
import { getCuentaPagarById, getHistorialCambiosResponsableByItem } from '@/lib/db'

// Historial de reasignaciones de responsable para la partida detrás de esta
// cuenta por pagar (historial_cambios_responsable_item, log append-only,
// Bloque 1). Una cuenta nace de una partida, salvo un gasto extra (#130, item_id null): ese no tiene historial.
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const cuenta = await getCuentaPagarById(id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    }

    if (!cuenta.item_id) return Response.json({ historial: [] })
    const historial = await getHistorialCambiosResponsableByItem(cuenta.item_id)
    return Response.json({ historial })
  } catch (error) {
    console.error('[cuentas-pagar/historial-responsable][GET]', error)
    return Response.json({ error: 'Error obteniendo historial de responsable' }, { status: 500 })
  }
}
