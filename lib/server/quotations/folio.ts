import { getNextFolio, getNextFolioComplementaria } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

export interface ReservedQuotationFolio {
  folio: string
  reservationToken: string | null
  atomic: boolean
  expiresAt: string | null
}

function isMissingFunctionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('reserve_next_cotizacion_folio') || message.includes('consume_cotizacion_folio_reservation')
}

function isMissingReservationTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('cotizacion_folio_reservations') || message.includes('relation')
}

export async function validateReservedQuotationFolio(
  folio: string,
  reservationToken: string,
): Promise<ReservedQuotationFolio | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('cotizacion_folio_reservations')
      .select('folio, token, expires_at, consumed_at')
      .eq('folio', folio)
      .eq('token', reservationToken)
      .maybeSingle()

    if (error) throw error
    if (!data) return null
    if (data.consumed_at) return null
    if (!data.expires_at || new Date(data.expires_at).getTime() <= Date.now()) return null

    return {
      folio: data.folio,
      reservationToken: data.token,
      atomic: true,
      expiresAt: data.expires_at,
    }
  } catch (error) {
    if (isMissingReservationTableError(error)) return null
    throw error
  }
}

export async function reserveNextQuotationFolio(baseFolio?: string): Promise<ReservedQuotationFolio> {
  try {
    const { data, error } = await supabaseAdmin.rpc('reserve_next_cotizacion_folio', {
      p_base_folio: baseFolio?.trim() || null,
    })
    if (error) throw error

    const payload = data as { folio?: string; token?: string; atomic?: boolean; expires_at?: string } | null
    if (!payload?.folio) throw new Error('La reserva de folio no devolvió un folio válido')

    return {
      folio: payload.folio,
      reservationToken: payload.token || null,
      atomic: payload.atomic !== false,
      expiresAt: payload.expires_at || null,
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
      expiresAt: null,
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
