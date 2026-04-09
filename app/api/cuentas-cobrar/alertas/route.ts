import { requireSection } from '@/lib/api-auth'
import { getCuentasCobrar } from '@/lib/db'

export async function GET() {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const cuentas = await getCuentasCobrar()
    const hoy = new Date()
    const fecha3diasAntes = new Date(hoy)
    fecha3diasAntes.setDate(fecha3diasAntes.getDate() - 3)

    // Filtrar alertas: cuentas no pagadas cercanas al vencimiento
    const alertas = cuentas
      .filter(c => c.estado !== 'PAGADO' && c.deadline_pago)
      .map(c => {
        const deadline = new Date(c.deadline_pago!)
        const diasFaltantes = Math.ceil((deadline.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
        const esVencida = deadline < hoy
        const estaPorVencer = diasFaltantes <= 3 && diasFaltantes > 0

        return {
          id: c.id,
          folio: c.folio,
          cliente: c.cliente,
          proyecto: c.proyecto,
          monto_total: c.monto_total,
          monto_pagado: c.monto_pagado || 0,
          deadline_pago: c.deadline_pago,
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
    return Response.json(
      { error: 'Error obteniendo alertas' },
      { status: 500 }
    )
  }
}
