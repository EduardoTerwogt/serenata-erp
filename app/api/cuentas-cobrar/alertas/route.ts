import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar, updateCuentaCobrar } from '@/lib/db'
import { calcularEstadoCuentaCobrarDetallado, calcularSaldoPendiente } from '@/lib/server/cuentas/status'

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentas = await getCuentasCobrar()
    const hoy = new Date()
    const hoyIso = hoy.toISOString().split('T')[0]

    const cuentasActualizadas = await Promise.all(
      cuentas.map(async (cuenta) => {
        const estadoCalculado = calcularEstadoCuentaCobrarDetallado({
          montoPagado: cuenta.monto_pagado || 0,
          montoTotal: cuenta.monto_total,
          fechaVencimiento: cuenta.fecha_vencimiento,
          isFacturada: cuenta.estado !== 'FACTURA_PENDIENTE' && !!cuenta.fecha_factura,
          today: hoy,
        })

        if (estadoCalculado !== cuenta.estado) {
          return updateCuentaCobrar(cuenta.id, { estado: estadoCalculado })
        }

        return cuenta
      })
    )

    const alertas = cuentasActualizadas
      .filter(c => c.estado !== 'PAGADO' && c.fecha_vencimiento)
      .map(c => {
        const deadline = new Date(c.fecha_vencimiento!)
        const diasFaltantes = Math.ceil((deadline.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
        const esVencida = c.fecha_vencimiento! < hoyIso
        const estaPorVencer = diasFaltantes <= 3 && diasFaltantes > 0

        return {
          id: c.id,
          folio: c.folio,
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
