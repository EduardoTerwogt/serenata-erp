import { requireSection } from '@/lib/api-auth'
import {
  getCuentaPagarById,
  getDocumentosCuentaPagar,
  getOrdenPagoById,
  getProveedorById,
  getCuentaPagarGrupoById,
  getCuentasPagarPorGrupo,
  getDocumentosCuentaPagarGrupo,
} from '@/lib/db'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const cuenta = await getCuentaPagarById(id)
    if (!cuenta) {
      return Response.json({ error: 'Cuenta por pagar no encontrada' }, { status: 404 })
    }

    // Si la cuenta forma parte de un grupo de facturación (docs/PLAN.md),
    // la factura/pago real ya no vive a nivel item -- los documentos y el
    // resumen de saldo se leen del grupo, con el desglose de las cuentas
    // hermanas para que el usuario vea qué compone el total.
    const grupo = cuenta.grupo_id ? await getCuentaPagarGrupoById(cuenta.grupo_id) : null

    const [documentos, ordenPago, proveedor, itemsGrupo] = await Promise.all([
      grupo ? getDocumentosCuentaPagarGrupo(grupo.id) : getDocumentosCuentaPagar(id),
      cuenta.orden_pago_id ? getOrdenPagoById(cuenta.orden_pago_id).catch(() => null) : Promise.resolve(null),
      // Fase 5.3 Bloque 3: régimen fiscal del proveedor asignado -- necesario
      // para mostrar el cruce fiscal (IVA + retenciones) en el modal de detalle.
      cuenta.responsable_id ? getProveedorById(cuenta.responsable_id).catch(() => null) : Promise.resolve(null),
      grupo ? getCuentasPagarPorGrupo(grupo.id) : Promise.resolve(null),
    ])

    return Response.json({
      cuenta,
      documentos,
      orden_pago: ordenPago,
      proveedor: proveedor ? { regimen_fiscal: proveedor.regimen_fiscal } : null,
      grupo: grupo ? { ...grupo, items: itemsGrupo || [] } : null,
      resumen: grupo
        ? {
            monto_pagado: grupo.monto_pagado || 0,
            saldo_pendiente: calcularSaldoPendiente(grupo.monto_total, grupo.monto_pagado || 0),
          }
        : {
            monto_pagado: cuenta.monto_pagado || 0,
            saldo_pendiente: calcularSaldoPendiente(cuenta.x_pagar, cuenta.monto_pagado || 0),
          },
    })
  } catch (error) {
    console.error('[cuentas-pagar/documentos]', error)
    return Response.json({ error: 'Error obteniendo documentos' }, { status: 500 })
  }
}
