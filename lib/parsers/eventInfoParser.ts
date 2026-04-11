/**
 * Parser for extracting event information from unstructured text.
 * Tolerant of variable formatting and incomplete data.
 * Returns extracted lines with confidence levels.
 */

export interface ExtractedEventLine {
  raw: string
  proyecto: string
  fecha: string | null
  locacion: string | null
  estado: 'confirmada' | 'pendiente' | 'cancelada' | 'unknown'
}

// Patterns for detecting status
const CONFIRMADA_PATTERNS = [
  /\bconfirm/i,
  /\(?\s*confirmad[ao]s?\s*\)?/i,
]

const PENDIENTE_PATTERNS = [
  /\bpending/i,
  /pendiente/i,
  /por confirmar/i,
  /naranja/i,
  /\(?\s*pendiente\s*\)?/i,
  /sin confirmar/i,
]

const CANCELADA_PATTERNS = [
  /\bcanceled?/i,
  /cancelad[ao]/i,
  /no va/i,
  /descartad[ao]/i,
]

// Date patterns - flexible to handle various formats
const DATE_PATTERNS = [
  /(\d{1,2})\s+(?:de\s+)?(enero|february|febrero|march|marzo|april|abril|may|mayo|june|junio|july|julio|august|agosto|september|septiembre|october|octubre|november|noviembre|december|diciembre)/i,
  /(\d{1,2})[-\/](\d{1,2})/,
  /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
  /(?:el\s+)?(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)/i,
]

// Month mapping (Spanish and English)
const MONTH_MAP: { [key: string]: number } = {
  enero: 1, january: 1, febrero: 2, february: 2, marzo: 3, march: 3,
  abril: 4, april: 4, mayo: 5, may: 5, junio: 6, june: 6,
  julio: 7, july: 7, agosto: 8, august: 8, septiembre: 9, september: 9,
  octubre: 10, october: 10, noviembre: 11, november: 11, diciembre: 12, december: 12,
}

export function parseEventInfo(text: string): ExtractedEventLine[] {
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  const results: ExtractedEventLine[] = []

  for (const line of lines) {
    const extracted = parseLine(line)
    if (extracted.proyecto || extracted.fecha || extracted.locacion) {
      results.push(extracted)
    }
  }

  return results
}

function parseLine(line: string): ExtractedEventLine {
  const raw = line.trim()

  // Detect estado
  let estado: 'confirmada' | 'pendiente' | 'cancelada' | 'unknown' = 'unknown'
  for (const pattern of CANCELADA_PATTERNS) {
    if (pattern.test(raw)) {
      estado = 'cancelada'
      break
    }
  }
  if (estado === 'unknown') {
    for (const pattern of CONFIRMADA_PATTERNS) {
      if (pattern.test(raw)) {
        estado = 'confirmada'
        break
      }
    }
  }
  if (estado === 'unknown') {
    for (const pattern of PENDIENTE_PATTERNS) {
      if (pattern.test(raw)) {
        estado = 'pendiente'
        break
      }
    }
  }

  // Extract date
  let fecha: string | null = null
  for (const pattern of DATE_PATTERNS) {
    const match = raw.match(pattern)
    if (match) {
      fecha = extractDateFromMatch(match, raw)
      if (fecha) break
    }
  }

  // Extract proyecto (usually first meaningful words, before dates/locations)
  // Remove status indicators and common noise
  let cleanLine = raw
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/\b(confirmad[ao]s?|pendiente|naranja|por confirmar|sin confirmar|cancelad[ao]|no va)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Extract location (usually at the end or after a location keyword)
  let locacion: string | null = null
  const locationMatch = cleanLine.match(/(?:cdmx|coyoacán|coyoacan|metepec|toluca|edomex|edo\.\s*mex|secundaria|fes|ebc|cecyt|metro|forum|foro|anáhuac|anáhuac|ymc|ymca|uvm)(?:\s+[a-záéíóú0-9]+)?/i)
  if (locationMatch) {
    locacion = locationMatch[0].trim()
    cleanLine = cleanLine.replace(locationMatch[0], '').trim()
  }

  // Extract proyecto (remaining text, usually)
  let proyecto = cleanLine.trim()

  // If proyecto is empty but we have other data, try to extract from original line
  if (!proyecto && (fecha || locacion)) {
    // Extract words that are not dates, locations, or status
    const words = raw
      .replace(/\(.*?\)/g, '')
      .split(/[\s\-–,;:]+/)
      .filter(w =>
        w.length > 2 &&
        !isDateWord(w) &&
        !isLocationWord(w) &&
        !isStatusWord(w) &&
        !isNumber(w)
      )
    proyecto = words.slice(0, 2).join(' ')
  }

  return {
    raw,
    proyecto: proyecto || '',
    fecha,
    locacion,
    estado: estado === 'unknown' ? 'confirmada' : estado,
  }
}

function extractDateFromMatch(match: RegExpMatchArray, context: string): string | null {
  // Try D+month format (e.g., "23 abril")
  if (match.length >= 3 && !isNumber(match[2])) {
    const day = parseInt(match[1])
    const monthStr = match[2].toLowerCase()
    const month = MONTH_MAP[monthStr]
    if (month && day >= 1 && day <= 31) {
      return `${day} ${monthStr}`
    }
  }

  // Try numeric formats
  if (match[1]) {
    const num1 = parseInt(match[1])

    if (match[3]) {
      // YYYY-MM-DD format
      return `${match[1]}-${match[2]}-${match[3]}`
    } else if (match[2]) {
      const num2 = parseInt(match[2])
      // Could be MM-DD or DD-MM, prefer DD-MM for "23 abril" context
      if (num1 <= 31 && num2 <= 12) {
        return `${num1}/${num2}`
      } else if (num2 <= 31) {
        return `${num2}/${num1}`
      }
    } else if (num1 <= 31) {
      // Single number - might be a day, need context
      // Look for month name nearby
      const monthMatch = context.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i)
      if (monthMatch) {
        return `${num1} ${monthMatch[1]}`
      }
      return `${num1}`
    }
  }

  return null
}

function isDateWord(word: string): boolean {
  return /^\d{1,2}$/.test(word) ||
         Object.keys(MONTH_MAP).some(m => m === word.toLowerCase()) ||
         /^\d{4}[-\/]/.test(word)
}

function isLocationWord(word: string): boolean {
  return /\b(cdmx|coyoacán|metepec|toluca|secundaria|fes|ebc|metro|anáhuac|ymc|ymca|uvm|foro|forum)\b/i.test(word)
}

function isStatusWord(word: string): boolean {
  return /\b(confirmad|pendiente|cancelad|naranja|naranja)\b/i.test(word)
}

function isNumber(word: string): boolean {
  return /^\d+$/.test(word)
}
