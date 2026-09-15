import { requirePortalSession } from '@/lib/portal-auth'
import { getCuentasPagarPorProveedor } from '@/lib/db'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE = 'GET /api/portal/cuentas'

export async function GET() {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const cuentas = await getCuentasPagarPorProveedor(portalAuth.proveedorId)
    return Response.json({
      cuentas: cuentas.map(c => ({
        id: c.id,
        proyecto_nombre: c.proyecto_nombre ?? null,
        item_descripcion: c.item_descripcion,
        x_pagar: c.x_pagar,
        estado: c.estado,
        monto_pagado: c.monto_pagado ?? 0,
        saldo_pendiente: calcularSaldoPendiente(c.x_pagar, c.monto_pagado || 0),
        fecha_factura: c.fecha_factura ?? null,
      })),
    })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
