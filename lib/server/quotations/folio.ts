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
      // Obtener todos los folios principales existentes
      const { data: existing } = await supabaseAdmin
        .from('cotizaciones')
        .select('id')
      const existingNumbers = new Set(
        (existing || []).map(c => extractPrincipalNumber(c.id)).filter((n): n is number => n !== null)
      )

      // Obtener reservas activas
      const { data: reserved, error } = await supabaseAdmin
        .from('cotizacion_folio_reservations')
        .select('folio')
        .eq('kind', 'PRINCIPAL')
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
      if (error) throw error

      const reservedNumbers = new Set(
        (reserved || []).map(r => extractPrincipalNumber(r.folio)).filter((n): n is number => n !== null)
      )

      // Buscar primer gap disponible empezando desde 1
      const maxNumber = Math.max(0, ...Array.from(existingNumbers), ...Array.from(reservedNumbers))
      for (let i = 1; i <= maxNumber; i++) {
        if (!existingNumbers.has(i) && !reservedNumbers.has(i)) {
          return `SH${String(i).padStart(3, '0')}`
        }
      }
      // Sin gaps, usar siguiente número
      return `SH${String(maxNumber + 1).padStart(3, '0')}`
    }

    // Complementarias — misma lógica de gaps
    const { data: existing } = await supabaseAdmin
      .from('cotizaciones')
      .select('id')
      .eq('es_complementaria_de', trimmedBase)
    const existingCodes = new Set(
      (existing || []).map(c => extractComplementariaCode(c.id, trimmedBase)).filter((n): n is number => n !== null)
    )

    const { data: reserved, error } = await supabaseAdmin
      .from('cotizacion_folio_reservations')
      .select('folio')
      .eq('kind', 'COMPLEMENTARIA')
      .eq('base_folio', trimmedBase)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
    if (error) throw error

    const reservedCodes = new Set(
      (reserved || []).map(r => extractComplementariaCode(r.folio, trimmedBase)).filter((n): n is number => n !== null)
    )

    const maxCode = Math.max(64, ...Array.from(existingCodes), ...Array.from(reservedCodes))
    for (let i = 65; i <= maxCode; i++) { // 65 = 'A'
      if (!existingCodes.has(i) && !reservedCodes.has(i)) {
        return `${trimmedBase}-${String.fromCharCode(i)}`
      }
    }
    return `${trimmedBase}-${String.fromCharCode(maxCode + 1)}`
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
    // La función RPC de reserva atómica no existe en la BD.
    // Fallar explícitamente: sin reserva atómica, dos requests concurrentes
    // podrían obtener el mismo folio y generar duplicados.
    throw new Error(
      'La función de reserva atómica de folio no está instalada en la base de datos. ' +
      'Ejecuta la migración 20260408_save_cotizacion_rpc.sql en Supabase.'
    )
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
