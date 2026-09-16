import { getNextFolio, getNextFolioComplementaria } from '@/lib/db'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { CacheManager } from '@/lib/api/cache'

export interface ReservedQuotationFolio {
  folio: string
  reservationToken: string | null
  atomic: boolean
  expiresAt: string | null
}

function isMissingFunctionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return (
    message.includes('reserve_next_cotizacion_folio') ||
    message.includes('consume_cotizacion_folio_reservation') ||
    message.includes('preview_next_cotizacion_folio_principal')
  )
}

function isMissingReservationTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('cotizacion_folio_reservations') || message.includes('relation')
}

function extractComplementariaCode(folio: string | null | undefined, baseFolio: string) {
  const escapedBase = baseFolio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = String(folio || '').match(new RegExp(`^${escapedBase}-([A-Z])$`))
  return match ? match[1].charCodeAt(0) : null
}

// EF-2 1D-3: el gate de p95 en Preview mostró 2314ms sin caché (>1s) para
// esta ruta -- única de las 4 medidas que no pasó (clientes/productos/
// proveedores quedan sin caché, sí pasaron el gate). El caché vive aquí, en
// la capa server, no en app/api/folio/route.ts -- approval.ts (también capa
// server) necesita invalidarlo, y una dependencia lib/server -> app/api
// invierte el layering (regresión detectada en auditoría del PR #31: el
// commit original de 1D-3 había eliminado esa dependencia a propósito).
const cache = new CacheManager(5 * 60 * 1000)

export async function previewNextQuotationFolio(baseFolio?: string): Promise<string> {
  const trimmedBase = baseFolio?.trim() || ''
  const cacheKey = `folio:${trimmedBase || 'normal'}`
  const cached = cache.get<string>(cacheKey)
  if (cached) return cached

  const folio = await computeNextQuotationFolio(trimmedBase)
  cache.set(cacheKey, folio)
  return folio
}

/**
 * Invalidate folio cache - called when quotations are approved and folios are consumed
 * Ensures the next folio prediction is accurate after a folio has been reserved
 */
export function invalidateFolioCache() {
  cache.invalidateAll()
}

async function computeNextQuotationFolio(trimmedBase: string): Promise<string> {
  if (!trimmedBase) {
    // EF-3 3B-7 (F14): el hueco libre desde 1 se calcula en SQL
    // (preview_next_cotizacion_folio_principal, principio del palomar)
    // en vez de traer toda la tabla `cotizaciones` a Node.
    try {
      const { data, error } = await supabaseAdmin.rpc('preview_next_cotizacion_folio_principal')
      if (error) throw error
      if (typeof data !== 'string' || !data) {
        // Mensaje sin el nombre de la función: isMissingFunctionError() hace
        // match por substring -- si el mensaje la nombrara, este error de
        // validación se confundiría con "la función no existe" y caería al
        // fallback en silencio en vez de propagarse.
        throw new Error('La RPC de folio principal no devolvió un folio válido')
      }
      return data
    } catch (error) {
      if (!isMissingFunctionError(error)) throw error
      return getNextFolio()
    }
  }

  try {
    // Complementarias — misma lógica de gaps en JS. Fuera de alcance de
    // 3B-7: ya acotada por `.eq('es_complementaria_de', ...)`, nunca trae
    // la tabla completa.
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
    return getNextFolioComplementaria(trimmedBase)
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
