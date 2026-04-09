import { requireSection } from '@/lib/api-auth'
import { getOrdenesPago } from '@/lib/db'

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const ordenes = await getOrdenesPago()

    return Response.json({
      total: ordenes.length,
      ordenes: ordenes.map(o => ({
        id: o.id,
        fecha_generacion: o.fecha_generacion,
        pdf_url: o.pdf_url,
        pdf_nombre: o.pdf_nombre,
        estado: o.estado,
        total_monto: o.total_monto,
        created_by: o.created_by,
        created_at: o.created_at,
      })),
    })
  } catch (error) {
    console.error('[cuentas-pagar/ordenes-historial]', error)
    return Response.json(
      { error: 'Error obteniendo historial de órdenes' },
      { status: 500 }
    )
  }
}
