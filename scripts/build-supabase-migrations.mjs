/**
 * Auditoría externa 2026-09-09 (Fase 4.5). db/migrations/*.sql sigue siendo
 * la fuente de verdad (se aplica a mano en el SQL Editor, como documenta
 * CLAUDE.md) -- este script solo COPIA esos archivos a supabase/migrations/
 * con un prefijo numérico global, en el mismo orden alfabético que ya usa
 * scripts/check-migrations.mjs, para que el Supabase CLI pueda reconstruir
 * el schema desde cero en un Postgres local efímero.
 *
 * supabase/migrations/ NO se commitea (ver .gitignore) -- se regenera en
 * cada corrida de CI. Nunca se usa para aplicar nada a un proyecto real:
 * eso lo sigue haciendo el flujo de siempre (SQL Editor / Supabase MCP,
 * probado primero en serenata-erp-test).
 *
 * Usage: node scripts/build-supabase-migrations.mjs
 */
import { readdirSync, copyFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = join(__dirname, '..', 'db', 'migrations')
const TARGET_DIR = join(__dirname, '..', 'supabase', 'migrations')

function main() {
  const files = readdirSync(SOURCE_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  if (files.length === 0) {
    console.error('No se encontraron migraciones en db/migrations/')
    process.exit(1)
  }

  rmSync(TARGET_DIR, { recursive: true, force: true })
  mkdirSync(TARGET_DIR, { recursive: true })

  files.forEach((file, i) => {
    const seq = String(i + 1).padStart(6, '0')
    copyFileSync(join(SOURCE_DIR, file), join(TARGET_DIR, `${seq}_${file}`))
  })

  console.log(`${files.length} migraciones copiadas de db/migrations/ a supabase/migrations/`)
}

main()
