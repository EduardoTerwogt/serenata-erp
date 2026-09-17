/**
 * Valida el tracker de 40 bloques de EF-3 (docs/EF-3_ENGINEERING_HARDENING.md
 * -> Sección 11, o docs/archive/ef-3-engineering-hardening.md una vez que
 * 3E-2 archive el canónico).
 *
 * Modo estructural (default, el que corre siempre en CI vía el job
 * tracker-lint): valida que el tracker esté bien formado, sin importar el
 * estado real de avance de EF-3 --
 *   (a) las 40 filas base existen, cada una con su ID exacto; hasta 3 filas
 *       condicionales de una lista blanca cerrada son válidas; cualquier
 *       otro ID falla.
 *   (b) todo ID listado en "Dependencias" de una fila existe como fila
 *       propia (base o condicional ya presente).
 *   (c) ninguna fila "Cerrado" tiene, según su tipo, "PR"+"Commit de
 *       merge" vacíos (bloque con rama) o "Commit SHA" vacío (bloque
 *       doc-only) -- nunca acepta ambos patrones vacíos a la vez, ni una
 *       mezcla inconsistente de los dos.
 *   (d) ningún bloque "En curso" tiene una dependencia que no esté
 *       "Cerrado".
 *
 * Modo --require-final [--except <ID>...] (solo lo invoca 3E-3 al
 * cerrarse, nunca tracker-lint en CI): además de (a)-(d), exige (e) que
 * toda fila (salvo las de --except) esté en Cerrado, No aplica, o
 * Diferido con aprobación con una nota de aprobación no vacía en la
 * columna "Nota".
 *
 * Usage:
 *   node scripts/validate-ef3-tracker.mjs
 *   node scripts/validate-ef3-tracker.mjs --require-final --except 3E-3
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')

export const BASE_BLOCK_IDS = [
  '3A-0', '3A-0b', '3A-1', '3A-2', '3A-3', '3A-4', '3A-5', '3A-6',
  '3B-1', '3B-2', '3B-3', '3B-4', '3B-5', '3B-6', '3B-7', '3B-8', '3B-9', '3B-10', '3B-11', '3B-12',
  '3C-1', '3C-2', '3C-3', '3C-4',
  '3D-0', '3D-1', '3D-2', '3D-3', '3D-4', '3D-5', '3D-6', '3D-7', '3D-8', '3D-9', '3D-10', '3D-11', '3D-12',
  '3E-1', '3E-2', '3E-3',
]

export const CONDITIONAL_BLOCK_IDS = ['3B-7b', '3C-4b', '3D-0b', '3E-1b']

export const DOC_ONLY_BLOCK_IDS = ['3A-0', '3A-6', '3D-8', '3E-1', '3E-2', '3E-3']

export const TRACKER_PATHS = [
  'docs/EF-3_ENGINEERING_HARDENING.md',
  'docs/archive/ef-3-engineering-hardening.md',
]

const TRACKER_HEADER_RE = /^\|\s*ID\s*\|\s*Estado\s*\|\s*Dependencias\s*\|/i

/** true para celdas vacías o placeholders (`—`, `-`, `N/A`, texto en blanco). */
function isPlaceholder(value) {
  const v = (value ?? '').trim()
  return v === '' || v === '—' || v === '-' || v.toUpperCase() === 'N/A'
}

function splitRow(line) {
  // Quita el primer y último `|` de una fila de tabla markdown y separa el
  // resto por `|` -- una fila bien formada siempre empieza y termina en `|`.
  const trimmed = line.trim()
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

/**
 * Encuentra el archivo del tracker probando TRACKER_PATHS en orden. Falla
 * explícito (lanza) si ninguna de las 2 rutas existe -- nunca asume "no hay
 * tracker, entonces paso".
 */
export function findTrackerFile(repoRoot = REPO_ROOT) {
  for (const relPath of TRACKER_PATHS) {
    const fullPath = join(repoRoot, relPath)
    if (existsSync(fullPath)) {
      return { path: relPath, content: readFileSync(fullPath, 'utf8') }
    }
  }
  throw new Error(
    `No se encontró el tracker de EF-3 en ninguna de las rutas esperadas: ${TRACKER_PATHS.join(', ')}`
  )
}

/**
 * Parsea la tabla del tracker (Sección 11) de un contenido markdown ya
 * leído. Devuelve un array de filas { id, estado, dependencias, rama, pr,
 * commitSha, commitMerge, nota, proximaAccion, raw }. Lanza si no encuentra
 * ninguna tabla con el encabezado esperado.
 */
export function parseTrackerTable(content) {
  const lines = content.split('\n')
  const headerIdx = lines.findIndex((l) => TRACKER_HEADER_RE.test(l))
  if (headerIdx === -1) {
    throw new Error('No se encontró la tabla del tracker (encabezado "| ID | Estado | Dependencias | ..." no hallado)')
  }
  const header = splitRow(lines[headerIdx])
  // La siguiente línea es el separador `|---|---|...|` -- se salta.
  const rows = []
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim().startsWith('|')) break
    const cells = splitRow(line)
    if (cells.length < header.length) continue // fila mal formada, no es dato real
    const byHeader = Object.fromEntries(header.map((h, idx) => [h, cells[idx] ?? '']))
    rows.push({
      id: byHeader['ID'],
      estado: byHeader['Estado'],
      dependencias: byHeader['Dependencias'],
      rama: byHeader['Rama'],
      pr: byHeader['PR'],
      commitSha: byHeader['Commit SHA'],
      commitMerge: byHeader['Commit de merge'],
      nota: byHeader['Nota'] ?? '',
      proximaAccion: byHeader['Próxima acción'] ?? '',
      raw: line,
    })
  }
  return rows
}

function parseDependencias(cell) {
  const trimmed = (cell ?? '').trim()
  if (trimmed === '' || trimmed.toLowerCase() === 'ninguna') return []
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

/** Valida (a)-(d), siempre. Devuelve { ok, errors }. */
export function validateStructural(rows) {
  const errors = []
  const allowedIds = new Set([...BASE_BLOCK_IDS, ...CONDITIONAL_BLOCK_IDS])
  const idsSeen = new Map() // id -> count

  for (const row of rows) {
    idsSeen.set(row.id, (idsSeen.get(row.id) ?? 0) + 1)
    if (!allowedIds.has(row.id)) {
      errors.push(`ID desconocido en el tracker: "${row.id}" (no está en las 40 filas base ni en la lista blanca de condicionales)`)
    }
  }

  for (const baseId of BASE_BLOCK_IDS) {
    if (!idsSeen.has(baseId)) errors.push(`Falta la fila base obligatoria: ${baseId}`)
  }

  for (const [id, count] of idsSeen) {
    if (count > 1) errors.push(`ID duplicado en el tracker: "${id}" aparece ${count} veces`)
  }

  const rowById = new Map(rows.map((r) => [r.id, r]))

  // (b) toda dependencia listada existe como fila propia.
  for (const row of rows) {
    for (const depId of parseDependencias(row.dependencias)) {
      if (!rowById.has(depId)) {
        errors.push(`${row.id}: depende de "${depId}", que no existe como fila del tracker`)
      }
    }
  }

  // (c) filas "Cerrado" -- campos consistentes según su tipo.
  for (const row of rows) {
    if (row.estado !== 'Cerrado') continue
    const isDocOnly = DOC_ONLY_BLOCK_IDS.includes(row.id)
    if (isDocOnly) {
      if (isPlaceholder(row.commitSha)) {
        errors.push(`${row.id}: Cerrado (doc-only) pero "Commit SHA" está vacío`)
      }
      if (!isPlaceholder(row.pr) || !isPlaceholder(row.commitMerge) || !isPlaceholder(row.rama)) {
        errors.push(`${row.id}: Cerrado (doc-only) pero "Rama"/"PR"/"Commit de merge" no están en N/A -- mezcla inconsistente de los 2 patrones`)
      }
    } else {
      if (isPlaceholder(row.pr) || isPlaceholder(row.commitMerge)) {
        errors.push(`${row.id}: Cerrado (bloque con rama) pero "PR"/"Commit de merge" está vacío`)
      }
    }
  }

  // (d) "En curso" -- toda dependencia debe estar Cerrado.
  for (const row of rows) {
    if (row.estado !== 'En curso') continue
    for (const depId of parseDependencias(row.dependencias)) {
      const dep = rowById.get(depId)
      if (dep && dep.estado !== 'Cerrado') {
        errors.push(`${row.id}: En curso pero su dependencia "${depId}" no está Cerrado (está "${dep.estado}")`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

const TERMINAL_STATES = new Set(['Cerrado', 'No aplica'])

/** Valida (e), solo en modo --require-final. Devuelve { ok, errors }. */
export function validateRequireFinal(rows, exceptIds = []) {
  const errors = []
  const exceptSet = new Set(exceptIds)
  for (const row of rows) {
    if (exceptSet.has(row.id)) continue
    if (TERMINAL_STATES.has(row.estado)) continue
    if (row.estado === 'Diferido con aprobación' && row.nota.trim() !== '') continue
    errors.push(
      `${row.id}: estado "${row.estado}" no es final (se requiere Cerrado, No aplica, o Diferido con aprobación con nota no vacía)`
    )
  }
  return { ok: errors.length === 0, errors }
}

function parseArgs(argv) {
  const requireFinal = argv.includes('--require-final')
  const exceptIds = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--except' && argv[i + 1]) exceptIds.push(argv[i + 1])
  }
  return { requireFinal, exceptIds }
}

function main() {
  const { requireFinal, exceptIds } = parseArgs(process.argv.slice(2))
  const { path, content } = findTrackerFile()
  console.log(`Tracker encontrado en: ${path}`)

  const rows = parseTrackerTable(content)
  console.log(`${rows.length} filas parseadas.`)

  const structural = validateStructural(rows)
  if (!structural.ok) {
    console.error('\nValidación estructural FALLÓ:')
    structural.errors.forEach((e) => console.error(`  - ${e}`))
    process.exit(1)
  }
  console.log('Validación estructural: OK')

  if (requireFinal) {
    const final = validateRequireFinal(rows, exceptIds)
    if (!final.ok) {
      console.error('\nValidación --require-final FALLÓ:')
      final.errors.forEach((e) => console.error(`  - ${e}`))
      process.exit(1)
    }
    console.log(`Validación --require-final (except: ${exceptIds.join(', ') || 'ninguno'}): OK`)
  }

  console.log('\nTracker de EF-3 válido.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
