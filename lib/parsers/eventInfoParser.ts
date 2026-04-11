/**
 * Parser for extracting event information from unstructured text.
 * Simplified to focus on structured rows: dates + locations.
 * Ignores narrative paragraphs.
 */

export interface ExtractedEventLine {
  raw: string
  fecha: string | null
  locacion: string | null
  ciudad?: string
  action?: 'confirmado' | 'por_confirmar' | 'cancelado'
}

// Patterns for detecting dates
const DATE_PATTERNS = [
  /(\d{1,2})\s+(?:de\s+)?(enero|february|febrero|march|marzo|april|abril|may|mayo|june|junio|july|julio|august|agosto|september|septiembre|october|octubre|november|noviembre|december|diciembre)/i,
  /(\d{1,2})[-\/](\d{1,2})/,
  /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
]

// Location keywords - expanded with schools, buildings, and common places
const LOCATION_KEYWORDS = [
  // Cities
  'cdmx', 'coyoacán', 'coyoacan', 'metepec', 'toluca', 'edomex', 'edo.\\s*mex',
  // Schools & Universities
  'secundaria', 'preparatoria', 'colegio', 'escuela', 'instituto', 'universidad',
  'fes', 'ebc', 'cecyt', 'anáhuac', 'anahuac', 'uvm',
  // Buildings & Venues
  'arena', 'forum', 'foro', 'anfiteatro', 'auditorio', 'sala', 'centro cultural',
  'metro', 'metro\\s+chabacano', 'chabacano', 'insurgentes', 'niebla',
  // Specific Places
  'ymca', 'ymc', 'hidalgo', 'aragon', 'tec', 'tec\\s+31',
  'parque', 'plaza', 'hotel', 'piso'
]

// Pre-compiled constants to avoid redundant regex compilation
const LOC_REGEX_PATTERN = LOCATION_KEYWORDS.join('|')
const LOC_REGEX = new RegExp(`(${LOC_REGEX_PATTERN})(?:\\s+[a-záéíóú0-9\\-]*)?`, 'i')
const EN_LOCATION_PATTERN = /\ben\s+([a-záéíóú\s\-0-9]+?)(?:\s*\(|$)/i
const STATUS_PATTERN = /\((confirmad[ao]|pend[ia]nte|cancelad[ao])\)/i
const CITY_KEYWORDS_PATTERN = /(cdmx|toluca|metepec|edomex|edo\.?\s*mex)/i

export function parseEventInfo(text: string): ExtractedEventLine[] {
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  const results: ExtractedEventLine[] = []

  for (const line of lines) {
    // Skip if line is mostly narrative (too long, no numbers)
    if (isNarrativeLine(line)) continue

    const extracted = parseLine(line)
    // Only keep lines that have at least a fecha or locacion
    if (extracted.fecha || extracted.locacion) {
      results.push(extracted)
    }
  }

  return results
}

function isNarrativeLine(line: string): boolean {
  const trimmed = line.trim()

  // Skip if it's greeting/closing
  if (/^(hola|gracias|avisenme|¡gracias|thanks|dear)/i.test(trimmed)) return true
  if (/^@[A-Za-z]/.test(trimmed)) return true
  if (/^(si ven|pero|en el caso|las que vienen|las fechas del)/i.test(trimmed)) return true

  // Skip if mostly text without dates/numbers
  const hasDate = /\d{1,2}/i.test(trimmed)
  const hasLocation = new RegExp(LOC_REGEX_PATTERN, 'i').test(trimmed)

  if (!hasDate && !hasLocation) return true

  return false
}

function parseLine(line: string): ExtractedEventLine {
  let raw = line.trim()

  // Strip leading bullets/dashes
  raw = raw.replace(/^[-*]\s+/, '').trim()

  // Remove "Confirmo:" prefix if present
  raw = raw.replace(/^(?:Confirmo|Confirmar)[:\s]+/i, '').trim()

  // Extract action from status indicators at the end
  let action: 'confirmado' | 'por_confirmar' | 'cancelado' | undefined
  const statusMatch = raw.match(STATUS_PATTERN)
  if (statusMatch) {
    const status = statusMatch[1].toLowerCase()
    if (status.startsWith('confirmad')) action = 'confirmado'
    else if (status.startsWith('pend')) action = 'por_confirmar'
    else if (status.startsWith('cancelad')) action = 'cancelado'
    // Remove status from raw for further parsing
    raw = raw.replace(/\s*\([^)]*\)\s*$/, '').trim()
  }

  // Extract fecha
  let fecha: string | null = null
  for (const pattern of DATE_PATTERNS) {
    const match = raw.match(pattern)
    if (match) {
      fecha = extractDateFromMatch(match)
      if (fecha) break
    }
  }

  // Extract ciudad and locacion
  let ciudad: string | undefined
  let locacion: string | null = null

  // Pattern 1: "ciudad, locacion" (separated by comma)
  const commaMatch = raw.match(/^([^,]+?[a-z])\s*,\s*(.+?)(?:\s+\(|$)/i)
  if (commaMatch) {
    const beforeComma = commaMatch[1].trim()
    const afterComma = commaMatch[2].trim()

    // Check if before comma is a city keyword
    if (CITY_KEYWORDS_PATTERN.test(beforeComma)) {
      ciudad = beforeComma
      // Try to find location keyword in the rest of the line
      const locMatch = raw.match(LOC_REGEX)
      if (locMatch) {
        locacion = locMatch[0].trim()
      } else {
        // If no keyword found, use the afterComma part
        locacion = afterComma
      }
    }
  }

  // Pattern 2: "fecha en [place]" (if no comma-based extraction)
  if (!locacion) {
    const enMatch = raw.match(EN_LOCATION_PATTERN)
    if (enMatch) {
      locacion = enMatch[1].trim()
    }
  }

  // Pattern 3: Location keyword match (fallback)
  if (!locacion) {
    const locMatch = raw.match(LOC_REGEX)
    if (locMatch) {
      locacion = locMatch[0].trim()
    }
  }

  return {
    raw: line.trim(),
    fecha,
    locacion,
    ciudad,
    action,
  }
}

function extractDateFromMatch(match: RegExpMatchArray): string | null {
  // D+ month format (e.g., "23 abril")
  if (match.length >= 3 && !/^\d/.test(match[2])) {
    const day = parseInt(match[1])
    const monthStr = match[2].toLowerCase()
    const month = getMonthNumber(monthStr)
    if (month && day >= 1 && day <= 31) {
      return `${day} ${monthStr}`
    }
  }

  // Numeric formats
  if (match[1]) {
    const num1 = parseInt(match[1])

    if (match[3]) {
      // YYYY-MM-DD
      return `${match[1]}-${match[2]}-${match[3]}`
    } else if (match[2]) {
      const num2 = parseInt(match[2])
      if (num1 <= 31 && num2 <= 12) {
        return `${num1}/${num2}`
      }
    } else if (num1 <= 31) {
      return String(num1)
    }
  }

  return null
}

function getMonthNumber(monthStr: string): number | null {
  const monthMap: { [key: string]: number } = {
    enero: 1, january: 1,
    febrero: 2, february: 2,
    marzo: 3, march: 3,
    abril: 4, april: 4,
    mayo: 5, may: 5,
    junio: 6, june: 6,
    julio: 7, july: 7,
    agosto: 8, august: 8,
    septiembre: 9, september: 9,
    octubre: 10, october: 10,
    noviembre: 11, november: 11,
    diciembre: 12, december: 12,
  }
  return monthMap[monthStr.toLowerCase()] || null
}

/**
 * Normaliza fechas extraídas por el parser a formato ISO YYYY-MM-DD
 * Soporta formatos:
 * - "23 abril" o "23 de abril" → 2026-04-23 (año actual asumido)
 * - "23/04" → 2026-04-23 (DD/MM)
 * - "23/04/2026" → 2026-04-23 (DD/MM/YYYY)
 * - "23/04/26" → 2026-04-23 (DD/MM/YY, interpreta 26 como 2026)
 * - "2026-04-23" → 2026-04-23 (ya ISO)
 * - "23" → null (día sin mes)
 * @param raw - Fecha en formato natural o parseado
 * @param anoBase - Año base para fechas sin año (default: año actual)
 * @returns Fecha en YYYY-MM-DD o null si no se puede parsear
 */
export function normalizarFechaISO(raw: string | null, anoBase?: number): string | null {
  if (!raw || !raw.trim()) return null

  const currentYear = anoBase ?? new Date().getFullYear()
  const trimmed = raw.trim()

  // Ya está en ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  // Formato "DD mes" o "DD de mes" (ej: "23 abril", "23 de abril")
  const mesMatch = trimmed.match(/^(\d{1,2})\s+(?:de\s+)?(enero|february|febrero|march|marzo|april|abril|may|mayo|june|junio|july|julio|august|agosto|september|septiembre|october|octubre|november|noviembre|december|diciembre)$/i)
  if (mesMatch) {
    const day = parseInt(mesMatch[1])
    const month = getMonthNumber(mesMatch[2])
    if (month && day >= 1 && day <= 31) {
      return formatDateISO(currentYear, month, day)
    }
  }

  // Formato DD/MM o DD/MM/YYYY o DD/MM/YY
  const numMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (numMatch) {
    const day = parseInt(numMatch[1])
    const month = parseInt(numMatch[2])
    let year = currentYear

    if (numMatch[3]) {
      const yearStr = numMatch[3]
      year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr)
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return formatDateISO(year, month, day)
    }
  }

  // No se pudo parsear
  return null
}

function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
