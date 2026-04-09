import { getCotizacionById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Cancel an EMITIDA or APROBADA quotation.
 * Deletes associated proyecto, cuentas_pagar, and cuentas_cobrar,
 * then sets estado = 'CANCELADA'.
 */
export async function cancelQuotation(id: string) {
  const cotizacion = await getCotizacionById(id)

  if (cotizacion.estado !== 'EMITIDA' && cotizacion.estado !== 'APROBADA') {
    throw new Error(
      `Solo se pueden cancelar cotizaciones en estado EMITIDA o APROBADA. Estado actual: ${cotizacion.estado}`
    )
  }

  // Delete related records (proyecto, cuentas)
  const { error: delProyecto } = await supabaseAdmin
    .from('proyectos')
    .delete()
    .eq('id', id)
  if (delProyecto) console.error('[cancelQuotation] Error borrando proyecto:', delProyecto.message)

  const { error: delPagar } = await supabaseAdmin
    .from('cuentas_pagar')
    .delete()
    .eq('cotizacion_id', id)
  if (delPagar) console.error('[cancelQuotation] Error borrando cuentas_pagar:', delPagar.message)

  const { error: delCobrar } = await supabaseAdmin
    .from('cuentas_cobrar')
    .delete()
    .eq('cotizacion_id', id)
  if (delCobrar) console.error('[cancelQuotation] Error borrando cuentas_cobrar:', delCobrar.message)

  // Update estado to CANCELADA
  const { error: updateError } = await supabaseAdmin
    .from('cotizaciones')
    .update({ estado: 'CANCELADA' })
    .eq('id', id)

  if (updateError) {
    throw new Error(`Error actualizando estado a CANCELADA: ${updateError.message}`)
  }

  return { ...cotizacion, estado: 'CANCELADA' }
}
