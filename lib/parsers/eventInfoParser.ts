/**
 * Parser for extracting event information from unstructured text.
 * Simplified to focus on structured rows: dates + locations.
 * Ignores narrative paragraphs.
 */

export interface ExtractedEventLine {
  raw: string
  fecha: string | null
  locacion: string | null
}

// Patterns for detecting dates
const DATE_PATTERNS = [
  /(\d{1,2})\s+(?:de\s+)?(enero|february|febrero|march|marzo|april|abril|may|mayo|june|junio|july|julio|august|agosto|september|septiembre|october|octubre|november|noviembre|december|diciembre)/i,
  /(\d{1,2})[-\/](\d{1,2})/,
  /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
]

// Location keywords
const LOCATION_KEYWORDS = [
  'cdmx', 'coyoacán', 'coyoacan', 'metepec', 'toluca', 'edomex', 'edo.\\s*mex',
  'secundaria', 'fes', 'ebc', 'cecyt', 'metro', 'forum', 'foro', 'anáhuac', 'anahuac',
  'ymc', 'ymca', 'uvm', 'hidalgo', 'chabacano', 'insurgentes', 'niebla', 'aragon'
]

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
  if (/^(@[A-Za-z]|\\[si ven|pero|en el caso|las que vienen|las fechas del)/i.test(trimmed)) return true

  // Skip if mostly text without dates/numbers
  const hasDate = /\d{1,2}/i.test(trimmed)
  const hasLocation = new RegExp(LOCATION_KEYWORDS.join('|'), 'i').test(trimmed)

  if (!hasDate && !hasLocation) return true

  return false
}

function parseLine(line: string): ExtractedEventLine {
  const raw = line.trim()

  // Extract fecha
  let fecha: string | null = null
  for (const pattern of DATE_PATTERNS) {
    const match = raw.match(pattern)
    if (match) {
      fecha = extractDateFromMatch(match)
      if (fecha) break
    }
  }

  // Extract locacion
  let locacion: string | null = null
  const locRegex = new RegExp(`(${LOCATION_KEYWORDS.join('|')})(?:\\s+[a-záéíóú0-9\\-,]*)?`, 'i')
  const locMatch = raw.match(locRegex)
  if (locMatch) {
    locacion = locMatch[0].trim()
  }

  return {
    raw,
    fecha,
    locacion,
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
