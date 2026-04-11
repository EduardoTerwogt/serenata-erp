import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Cotizacion } from '@/lib/types'

export interface MatchResult {
  found: boolean
  quotation?: Cotizacion
  similarity: number // 0-1
  reason: string
}

/**
 * Find similar existing quotation based on fecha_entrega and locacion.
 * Uses fuzzy matching with tolerance for slight variations.
 */
export async function findSimilarQuotation(
  fecha: string | null,
  locacion: string | null,
  cliente?: string
): Promise<MatchResult> {
  if (!fecha && !locacion) {
    return {
      found: false,
      similarity: 0,
      reason: 'Sin fecha ni locación para buscar',
    }
  }

  try {
    // Fetch all quotations
    const { data: quotations, error } = await supabaseAdmin
      .from('cotizaciones')
      .select('*')
      .eq('estado', 'APROBADA')
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!quotations || quotations.length === 0) {
      return {
        found: false,
        similarity: 0,
        reason: 'No hay cotizaciones para comparar',
      }
    }

    let bestMatch: { quotation: Cotizacion; similarity: number } | null = null

    for (const quot of quotations) {
      const similarity = calculateSimilarity(
        fecha,
        locacion,
        quot.fecha_entrega,
        quot.locacion,
        cliente,
        quot.cliente
      )

      if (similarity > 0.6) { // Threshold for "similar"
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { quotation: quot, similarity }
        }
      }
    }

    if (bestMatch) {
      return {
        found: true,
        quotation: bestMatch.quotation,
        similarity: bestMatch.similarity,
        reason: `Match encontrado: ${bestMatch.quotation.cliente} - ${bestMatch.quotation.proyecto}`,
      }
    }

    return {
      found: false,
      similarity: 0,
      reason: 'Sin coincidencias cercanas',
    }
  } catch (error) {
    console.error('Error finding similar quotation:', error)
    return {
      found: false,
      similarity: 0,
      reason: 'Error en búsqueda',
    }
  }
}

/**
 * Calculate similarity between two sets of fecha and locacion.
 * Returns 0-1 where 1 is exact match.
 */
function calculateSimilarity(
  newFecha: string | null,
  newLocacion: string | null,
  existingFecha: string | null,
  existingLocacion: string | null,
  newCliente?: string,
  existingCliente?: string
): number {
  let score = 0
  let maxScore = 0

  // Date comparison (weight: 0.5)
  if (newFecha && existingFecha) {
    maxScore += 0.5
    const fechaSimilarity = compareDates(newFecha, existingFecha)
    score += fechaSimilarity * 0.5
  } else if (newFecha || existingFecha) {
    maxScore += 0.5
  }

  // Location comparison (weight: 0.4)
  if (newLocacion && existingLocacion) {
    maxScore += 0.4
    const locationSimilarity = compareLocations(newLocacion, existingLocacion)
    score += locationSimilarity * 0.4
  } else if (newLocacion || existingLocacion) {
    maxScore += 0.4
  }

  // Client comparison (weight: 0.1)
  if (newCliente && existingCliente) {
    maxScore += 0.1
    if (newCliente.toLowerCase() === existingCliente.toLowerCase()) {
      score += 0.1
    }
  } else if (newCliente || existingCliente) {
    maxScore += 0.1
  }

  return maxScore > 0 ? score / maxScore : 0
}

/**
 * Compare two date strings with tolerance.
 * Handles various date formats.
 */
function compareDates(date1: string, date2: string): number {
  // Normalize dates
  const norm1 = normalizeDate(date1)
  const norm2 = normalizeDate(date2)

  if (!norm1 || !norm2) return 0

  // Exact match
  if (norm1 === norm2) return 1

  // Parse day and month
  const match1 = parseSimpleDate(norm1)
  const match2 = parseSimpleDate(norm2)

  if (!match1 || !match2) return 0

  // Same day and month = high similarity (0.9)
  if (match1.day === match2.day && match1.month === match2.month) {
    return 0.9
  }

  // Within 2 days = medium similarity (0.5)
  if (match1.month === match2.month && Math.abs(match1.day - match2.day) <= 2) {
    return 0.5
  }

  return 0
}

/**
 * Compare two location strings with fuzzy matching.
 */
function compareLocations(loc1: string, loc2: string): number {
  const norm1 = normalizeLocation(loc1)
  const norm2 = normalizeLocation(loc2)

  // Exact match
  if (norm1 === norm2) return 1

  // Substring match
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8

  // Common abbrev/variations
  const abbrevMatch = checkLocationAbbreviations(norm1, norm2)
  if (abbrevMatch) return 0.7

  return 0
}

function normalizeDate(date: string): string {
  return date.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeLocation(location: string): string {
  return location
    .toLowerCase()
    .replace(/\b(coyoacán|coyoacan)\b/g, 'coyoacan')
    .replace(/\b(méxico|mexico)\b/g, 'mexico')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ParsedDate {
  day: number
  month: number
}

function parseSimpleDate(dateStr: string): ParsedDate | null {
  // Try "23 abril"
  const match1 = dateStr.match(/(\d{1,2})\s+([a-záéíóú]+)/)
  if (match1) {
    const day = parseInt(match1[1])
    const monthStr = match1[2].toLowerCase()
    const monthMap: { [key: string]: number } = {
      enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
      julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    }
    const month = monthMap[monthStr]
    if (month) return { day, month }
  }

  // Try "23/4" or "23-4"
  const match2 = dateStr.match(/(\d{1,2})[-\/](\d{1,2})/)
  if (match2) {
    return { day: parseInt(match2[1]), month: parseInt(match2[2]) }
  }

  return null
}

function checkLocationAbbreviations(loc1: string, loc2: string): boolean {
  const abbrevs: { [key: string]: string[] } = {
    'fes': ['facultad', 'fes aragon', 'fes acatlan'],
    'metro': ['estación', 'linea', 'glorieta'],
    'secundaria': ['sec', 'escuela'],
    'anáhuac': ['anahuac', 'universidad'],
    'uvm': ['universidad', 'virtual'],
  }

  for (const [key, variations] of Object.entries(abbrevs)) {
    const hasKey1 = loc1.includes(key)
    const hasKey2 = loc2.includes(key)

    if (hasKey1 && hasKey2) return true

    for (const variant of variations) {
      if ((hasKey1 || loc1.includes(variant)) && (hasKey2 || loc2.includes(variant))) {
        return true
      }
    }
  }

  return false
}
