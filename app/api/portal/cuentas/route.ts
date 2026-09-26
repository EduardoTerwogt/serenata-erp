import { requirePortalSession } from '@/lib/portal-auth'
import { getCuentasPagarPorProveedor, getCuentasPagarGruposPorProveedor, getProveedorById } from '@/lib/db'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { round2 } from '@/lib/shared/decimal'
import { calcularEjemploFactura } from '@/lib/shared/factura-fiscal'
import { CuentaPagar, RegimenFiscal } from '@/lib/types'

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

// Rediseño de Cuentas B2 (D14, supuesto 6): el proveedor ve sus montos en
// TOTAL A TRANSFERIR -- el snapshot del CFDI si ya hay factura validada, si
// no el estimado con su régimen. monto_total/saldo_pendiente siguen en neto.
function enTransferir(neto: number, snapshot: number | null | undefined, transferido: number | null | undefined, regimen: RegimenFiscal | null) {
  const total = snapshot != null ? round2(Number(snapshot)) : calcularEjemploFactura(neto, regimen).total
  const pagado = round2(Number(transferido ?? 0))
  return { total_a_transferir: total, monto_transferido: pagado, saldo_por_transferir: Math.max(0, round2(total - pagado)) }
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
    const [cuentas, grupos, proveedor] = await Promise.all([
      getCuentasPagarPorProveedor(portalAuth.proveedorId),
      getCuentasPagarGruposPorProveedor(portalAuth.proveedorId),
      getProveedorById(portalAuth.proveedorId),
    ])
    const regimen = (proveedor?.regimen_fiscal ?? null) as RegimenFiscal | null

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
        ...enTransferir(grupo.monto_total, grupo.total_a_transferir, grupo.monto_transferido, regimen),
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
        ...enTransferir(c.x_pagar, c.total_a_transferir, c.monto_transferido, regimen),
        items: [itemDeCuenta(c)],
      }))

    return Response.json({ grupos: [...gruposConItems, ...sueltasSinGrupo] })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
