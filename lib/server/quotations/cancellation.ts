import { getCotizacionById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

export async function cancelQuotation(id: string) {
  const cotizacion = await getCotizacionById(id)

  if (cotizacion.estado !== 'EMITIDA' && cotizacion.estado !== 'APROBADA') {
    throw new Error(
      `Solo se pueden cancelar cotizaciones en estado EMITIDA o APROBADA. Estado actual: ${cotizacion.estado}`
    )
  }

  // Bloquear cancelación si ya hay pagos registrados en cuentas_cobrar
  const { data: cuentas, error: cuentasError } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('id, monto_pagado')
    .eq('cotizacion_id', id)

  if (cuentasError) {
    throw new Error(`Error verificando pagos: ${cuentasError.message}`)
  }

  const totalPagado = (cuentas || []).reduce((sum, c) => sum + (Number(c.monto_pagado) || 0), 0)
  if (totalPagado > 0) {
    throw new Error(
      `No se puede cancelar: ya existe un pago de $${totalPagado.toFixed(2)} registrado en esta cotización. ` +
      `Contacta al administrador para revertir el pago antes de cancelar.`
    )
  }

  const { data, error } = await supabaseAdmin.rpc('cancel_cotizacion', { p_id: id })

  if (error) {
    throw new Error(`Error cancelando cotizacion: ${error.message}`)
  }

  return { ...cotizacion, estado: 'CANCELADA' }
}
