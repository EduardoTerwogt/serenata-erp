/**
 * Lists db/migrations/ in application order and validates the naming
 * convention (YYYYMMDD_description.sql). Does NOT apply migrations to any
 * real project — those se siguen aplicando a mano en el SQL Editor
 * (probado primero en serenata-erp-test, luego producción).
 *
 * Desde Fase 4.5 (auditoría externa 2026-09-09), scripts/build-supabase-migrations.mjs
 * + el job "Migrations" de CI SÍ usan el Supabase CLI para verificar en cada
 * push que este mismo conjunto de SQL reconstruye el schema completo desde
 * una base Postgres vacía — pero solo como gate de CI, nunca contra un
 * proyecto real.
 *
 * Este script sigue existiendo para no tener ambigüedad sobre "qué
 * migraciones hay y en qué orden" antes de una sesión de aplicación manual.
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
