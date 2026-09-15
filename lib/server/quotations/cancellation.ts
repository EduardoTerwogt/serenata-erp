import { getCotizacionById } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { DomainError } from '@/lib/server/errors/domain-error'

// EF-3 3D-9: lanza DomainError directo (nunca un Error genérico con el
// mensaje de Postgres interpolado) -- el caller (la ruta) solo necesita
// hacer `return buildErrorResponse(error, ROUTE)`, sin adivinar el status
// por el contenido del mensaje.
export async function cancelQuotation(id: string) {
  const cotizacion = await getCotizacionById(id)

  if (cotizacion.estado !== 'EMITIDA' && cotizacion.estado !== 'APROBADA') {
    throw new DomainError({
      code: 'estado_invalido',
      status: 403,
      safeMessage: `Solo se pueden cancelar cotizaciones en estado EMITIDA o APROBADA. Estado actual: ${cotizacion.estado}`,
    })
  }

  // Bloquear cancelación si ya hay pagos registrados en cuentas_cobrar
  const { data: cuentas, error: cuentasError } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('id, monto_pagado')
    .eq('cotizacion_id', id)

  if (cuentasError) {
    throw new DomainError({
      code: 'error_verificando_pagos',
      status: 500,
      safeMessage: 'Error verificando pagos existentes, intenta de nuevo',
      cause: cuentasError,
    })
  }

  const totalPagado = (cuentas || []).reduce((sum, c) => sum + (Number(c.monto_pagado) || 0), 0)
  if (totalPagado > 0) {
    throw new DomainError({
      code: 'pago_existente',
      status: 500,
      safeMessage:
        `No se puede cancelar: ya existe un pago de $${totalPagado.toFixed(2)} registrado en esta cotización. ` +
        `Contacta al administrador para revertir el pago antes de cancelar.`,
    })
  }

  const { error } = await supabaseAdmin.rpc('cancel_cotizacion', { p_id: id })

  if (error) {
    throw new DomainError({
      code: 'error_cancelando_cotizacion',
      status: 500,
      safeMessage: 'Error cancelando la cotización, intenta de nuevo',
      cause: error,
    })
  }

  return { ...cotizacion, estado: 'CANCELADA' }
}
