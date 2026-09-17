import { requirePortalSession } from '@/lib/portal-auth'
import { getCuentasPagarPorProveedor, getCuentasPagarGruposPorProveedor } from '@/lib/db'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { CuentaPagar } from '@/lib/types'

const ROUTE = 'GET /api/portal/cuentas'

function itemDeCuenta(c: CuentaPagar) {
  return {
    id: c.id,
    item_descripcion: c.item_descripcion,
    cantidad: c.cantidad,
    x_pagar: c.x_pagar,
    cotizacion_id: c.cotizacion_id,
  }
}

/**
 * Bloque 4 de la agrupación de Cuentas por Pagar (docs/PLAN.md): contrato
 * nuevo, no transicional (único consumidor: app/portal/page.tsx) -- el
 * proveedor factura por grupo, no por item suelto.
 *
 * Cada cuenta_pagar del proveedor con grupo_id se agrega bajo su grupo real
 * (facturable solo si el grupo sigue ABIERTO). Cualquier cuenta legacy sin
 * grupo_id todavía (previa a esta iniciativa, o excluida a propósito de la
 * migración retroactiva del Bloque 5 por ya tener documento o pago en
 * curso) se muestra igual, como un grupo sintético de un solo item --
 * nunca desaparece de la vista del proveedor -- pero nunca es facturable
 * por esta ruta: si ya tiene documento o pago en curso, ya fue facturada
 * por el flujo legacy; si de verdad le falta grupo, el Bloque 5 la alcanza.
 */
export async function GET() {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const [cuentas, grupos] = await Promise.all([
      getCuentasPagarPorProveedor(portalAuth.proveedorId),
      getCuentasPagarGruposPorProveedor(portalAuth.proveedorId),
    ])

    const gruposConItems = grupos.map((grupo) => {
      const items = cuentas.filter((c) => c.grupo_id === grupo.id)
      return {
        id: grupo.id,
        es_grupo: true,
        facturable: grupo.estado === 'ABIERTO',
        proyecto_id: grupo.proyecto_id,
        proyecto_nombre: grupo.proyecto_nombre ?? null,
        estado: grupo.estado,
        monto_total: grupo.monto_total,
        monto_pagado: grupo.monto_pagado,
        saldo_pendiente: calcularSaldoPendiente(grupo.monto_total, grupo.monto_pagado || 0),
        items: items.map(itemDeCuenta),
      }
    })

    const sueltasSinGrupo = cuentas
      .filter((c) => !c.grupo_id)
      .map((c) => ({
        id: c.id,
        es_grupo: false,
        facturable: false,
        proyecto_id: c.proyecto_id,
        proyecto_nombre: c.proyecto_nombre ?? null,
        estado: c.estado,
        monto_total: c.x_pagar,
        monto_pagado: c.monto_pagado || 0,
        saldo_pendiente: calcularSaldoPendiente(c.x_pagar, c.monto_pagado || 0),
        items: [itemDeCuenta(c)],
      }))

    return Response.json({ grupos: [...gruposConItems, ...sueltasSinGrupo] })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
