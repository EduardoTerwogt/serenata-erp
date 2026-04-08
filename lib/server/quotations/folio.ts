import { getNextFolio, getNextFolioComplementaria } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

export interface ReservedQuotationFolio {
  folio: string
  reservationToken: string | null
  atomic: boolean
}

function isMissingFunctionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('reserve_next_cotizacion_folio') || message.includes('consume_cotizacion_folio_reservation')
}

export async function reserveNextQuotationFolio(baseFolio?: string): Promise<ReservedQuotationFolio> {
  try {
    const { data, error } = await supabaseAdmin.rpc('reserve_next_cotizacion_folio', {
      p_base_folio: baseFolio?.trim() || null,
    })
    if (error) throw error

    const payload = data as { folio?: string; token?: string; atomic?: boolean } | null
    if (!payload?.folio) throw new Error('La reserva de folio no devolvió un folio válido')

    return {
      folio: payload.folio,
      reservationToken: payload.token || null,
      atomic: payload.atomic !== false,
    }
  } catch (error) {
    if (!isMissingFunctionError(error)) throw error

    const folio = baseFolio?.trim()
      ? await getNextFolioComplementaria(baseFolio.trim())
      : await getNextFolio()

    return {
      folio,
      reservationToken: null,
      atomic: false,
    }
  }
}

export async function consumeReservedQuotationFolio(folio: string, reservationToken?: string | null) {
  if (!reservationToken) return

  try {
    const { data, error } = await supabaseAdmin.rpc('consume_cotizacion_folio_reservation', {
      p_token: reservationToken,
      p_folio: folio,
    })

    if (error) throw error
    if (!data) {
      throw new Error('La reserva de folio expiró o ya fue utilizada. Recarga la página e inténtalo de nuevo.')
    }
  } catch (error) {
    if (isMissingFunctionError(error)) return
    throw error
  }
}
