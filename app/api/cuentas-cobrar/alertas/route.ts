import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { calcularSaldoPendiente } from '@/lib/server/cuentas/status'

// EF-3 3B-1: mismo recalculo que app/api/cuentas-cobrar/route.ts, ahora
// vía la RPC unica sync_estados_cuentas_cobrar_vencidas() -- esta ruta ya
// no duplica la logica de calcularEstadoCuentaCobrarDetallado ni escribe
// cuenta por cuenta.
export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { error: syncError } = await supabaseAdmin.rpc('sync_estados_cuentas_cobrar_vencidas')
    if (syncError) throw syncError

    const cuentasActualizadas = await getCuentasCobrar()
    const hoy = new Date()
    const hoyIso = hoy.toISOString().split('T')[0]

    const alertas = cuentasActualizadas
      .filter((c): c is typeof c & { fecha_vencimiento: string } =>
        c.estado !== 'PAGADO' && c.fecha_vencimiento != null
      )
      .map(c => {
        const deadline = new Date(c.fecha_vencimiento)
        const diasFaltantes = Math.ceil((deadline.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
        const esVencida = c.fecha_vencimiento < hoyIso
        const estaPorVencer = diasFaltantes <= 3 && diasFaltantes > 0

        return {
          id: c.id,
          folio: c.folio,
          cotizacion_id: c.cotizacion_id,
          cliente: c.cliente,
          proyecto: c.proyecto,
          monto_total: c.monto_total,
          monto_pagado: c.monto_pagado || 0,
          saldo_pendiente: calcularSaldoPendiente(c.monto_total, c.monto_pagado || 0),
          fecha_vencimiento: c.fecha_vencimiento,
          dias_faltantes: diasFaltantes,
          estado: c.estado,
          alerta: esVencida ? 'VENCIDA' : estaPorVencer ? 'POR_VENCER' : null,
          mensaje: esVencida
            ? `Vencida hace ${Math.abs(diasFaltantes)} día(s)`
            : estaPorVencer
              ? `Vence en ${diasFaltantes} día(s)`
              : null,
        }
      })
      .filter(a => a.alerta !== null)
      .sort((a, b) => a.dias_faltantes - b.dias_faltantes)

    return Response.json({
      total_alertas: alertas.length,
      vencidas: alertas.filter(a => a.alerta === 'VENCIDA').length,
      por_vencer: alertas.filter(a => a.alerta === 'POR_VENCER').length,
      alertas,
    })
  } catch (error) {
    console.error('[cuentas-cobrar/alertas]', error)
    return Response.json({ error: 'Error obteniendo alertas' }, { status: 500 })
  }
}
