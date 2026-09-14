import { requireSection } from '@/lib/api-auth'
import { buscarOrdenesPago } from '@/lib/db'

// EF-3 3B-11: ya no trae TODAS las órdenes de pago -- delega paginado a la
// RPC buscar_ordenes_pago. Shape de respuesta sin cambios ({total,
// ordenes: [...]}), solo que ahora `total` refleja el total real de filas
// (no ordenes.length de la página) y `ordenes` es una página, no todo.
export async function GET(req: Request) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page')) || 1
    const pageSize = Number(searchParams.get('pageSize')) || 50

    const { rows, totalRows } = await buscarOrdenesPago(page, pageSize)

    return Response.json({
      total: totalRows,
      ordenes: rows.map(o => ({
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
