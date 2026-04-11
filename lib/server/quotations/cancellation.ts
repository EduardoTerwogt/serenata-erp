import { getCotizacionById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Cancel an EMITIDA or APROBADA quotation.
 * Uses RPC transaction to atomically:
 * - Delete associated proyecto, cuentas_pagar, and cuentas_cobrar
 * - Update estado to 'CANCELADA'
 *
 * If any operation fails, the entire transaction is rolled back,
 * ensuring data integrity.
 */
export async function cancelQuotation(id: string) {
  const cotizacion = await getCotizacionById(id)

  // Validate estado before attempting cancellation
  if (cotizacion.estado !== 'EMITIDA' && cotizacion.estado !== 'APROBADA') {
    throw new Error(
      `Solo se pueden cancelar cotizaciones en estado EMITIDA o APROBADA. Estado actual: ${cotizacion.estado}`
    )
  }

  // Use RPC for transactional safety - all operations succeed or all fail
  const { data, error } = await supabaseAdmin.rpc('cancel_cotizacion', { p_id: id })

  if (error) {
    throw new Error(`Error cancelando cotizacion: ${error.message}`)
  }

  // Return cancelled cotización with updated estado
  return { ...cotizacion, estado: 'CANCELADA' }
}
