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

function extractPrincipalNumber(folio: string | null | undefined) {
  const match = String(folio || '').match(/^SH(\d+)$/)
  return match ? Number(match[1]) : null
}

function extractComplementariaCode(folio: string | null | undefined, baseFolio: string) {
  const escapedBase = baseFolio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(folio || '').match(new RegExp(`^${escapedBase}-([A-Z])$`))
  return match ? match[1].charCodeAt(0) : null
}

export async function previewNextQuotationFolio(baseFolio?: string): Promise<string> {
  const trimmedBase = baseFolio?.trim() || ''

  try {
    if (!trimmedBase) {
      const nextFromReal = await getNextFolio()
      const realNumber = (extractPrincipalNumber(nextFromReal) ?? 1) - 1

      const { data, error } = await supabaseAdmin
        .from('cotizacion_folio_reservations')
        .select('folio')
        .eq('kind', 'PRINCIPAL')
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())

      if (error) throw error

      const activeMax = Math.max(0, ...(data || []).map(row => extractPrincipalNumber(row.folio) ?? 0))
      const next = Math.max(realNumber, activeMax) + 1
      return `SH${String(next).padStart(3, '0')}`
    }

    const nextFromReal = await getNextFolioComplementaria(trimmedBase)
    const nextCode = extractComplementariaCode(nextFromReal, trimmedBase) ?? 65
    const realCode = nextCode - 1

    const { data, error } = await supabaseAdmin
      .from('cotizacion_folio_reservations')
      .select('folio')
      .eq('kind', 'COMPLEMENTARIA')
      .eq('base_folio', trimmedBase)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())

    if (error) throw error

    const activeMax = Math.max(64, ...(data || []).map(row => extractComplementariaCode(row.folio, trimmedBase) ?? 64))
    const finalCode = Math.max(realCode, activeMax) + 1
    return `${trimmedBase}-${String.fromCharCode(finalCode)}`
  } catch (error) {
    if (!isMissingReservationTableError(error)) throw error
    return trimmedBase ? getNextFolioComplementaria(trimmedBase) : getNextFolio()
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
