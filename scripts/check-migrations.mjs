/**
 * Lists db/migrations/ in application order and validates the naming
 * convention (YYYYMMDD_description.sql). Does NOT apply migrations —
 * there is no Supabase CLI wired up in this repo (see FASE_5b_INDEXES_README.md),
 * so migrations are still applied by hand in the Supabase SQL Editor.
 *
 * This script exists only to remove ambiguity about "which migrations
 * exist and in what order" before a manual apply session.
 *
 * Usage: node scripts/check-migrations.mjs
 */
import { readdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'db', 'migrations')
const NAME_PATTERN = /^(\d{8})_([a-z0-9_]+)\.sql$/

function main() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

  const invalid = files.filter((f) => !NAME_PATTERN.test(f))
  if (invalid.length > 0) {
    console.error('Archivos que no siguen la convención YYYYMMDD_descripcion.sql:')
    invalid.forEach((f) => console.error(`  - ${f}`))
    process.exit(1)
  }

  const ordered = [...files].sort((a, b) => a.localeCompare(b))

  console.log(`${ordered.length} migraciones en db/migrations/, orden de aplicación:\n`)
  ordered.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2, '0')}. ${f}`))

  const manifestPath = join(__dirname, '..', 'db', 'migrations', '_manifest.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({ generated_at: new Date().toISOString(), count: ordered.length, order: ordered }, null, 2) + '\n'
  )
  console.log(`\nManifiesto escrito en db/migrations/_manifest.json`)
  console.log('Nota: este script no aplica migraciones. Se siguen ejecutando a mano en el SQL Editor de Supabase.')
}

main()
