/**
 * Mapa de dependencias de una columna (PLAN.md, "Cómo se garantiza", punto 1).
 *
 * Antes de borrar o renombrar `tabla.columna`, lista TODO lo que la menciona:
 *   - código del repo (git grep, solo archivos versionados; excluye
 *     db/migrations, que es historia, y docs/);
 *   - funciones de `public` (pg_get_functiondef);
 *   - triggers (definición y condición WHEN);
 *   - vistas y vistas materializadas;
 *   - políticas RLS;
 *   - restricciones (`CHECK`, `FK`, `UNIQUE`) e índices;
 *   - dependencias registradas en pg_depend sobre la columna.
 *
 * Exit code 1 si encuentra algo (el mapa "en cero" es el criterio de salida
 * para borrar la columna vieja); 0 si no hay ninguna dependencia.
 *
 * La búsqueda es por nombre de columna con límites de palabra, así que puede
 * dar falsos positivos (otra tabla con una columna del mismo nombre): cada
 * hallazgo se revisa a mano. Prefiere pecar de más que de menos.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db/mapa-dependencias.mjs \
 *     <project-ref> <tabla.columna>
 *   (omite <project-ref> con --solo-repo para buscar solo en el código)
 *
 * Solo lectura: las consultas al catálogo van por la Management API, igual
 * que scripts/check-schema-parity.mjs. Nunca commitear el token.
 */
import { execFileSync } from 'child_process'

const IDENT = /^[a-z_][a-z0-9_]*$/

function parseArgs(argv) {
  const soloRepo = argv.includes('--solo-repo')
  const positional = argv.filter((a) => !a.startsWith('--'))
  const objetivo = soloRepo ? positional[0] : positional[1]
  const projectRef = soloRepo ? null : positional[0]
  return { soloRepo, projectRef, objetivo }
}

function uso() {
  console.error(
    'Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db/mapa-dependencias.mjs <project-ref> <tabla.columna>\n' +
      '     node scripts/db/mapa-dependencias.mjs --solo-repo <tabla.columna>',
  )
  process.exit(2)
}

function buscarEnRepo(columna) {
  try {
    const salida = execFileSync(
      'git',
      [
        'grep',
        '-n',
        '-w',
        '-I',
        '--',
        columna,
        ':(exclude)db/migrations',
        ':(exclude)docs',
        ':(exclude)package-lock.json',
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    return salida.split('\n').filter(Boolean)
  } catch (err) {
    if (err.status === 1) return [] // git grep: sin coincidencias
    throw err
  }
}

async function consultar(projectRef, token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Management API respondió ${res.status}: ${body}`)
  }
  return res.json()
}

// `tabla` y `columna` ya pasaron IDENT: es seguro interpolarlos.
function consultasCatalogo(tabla, columna) {
  const re = `'\\m${columna}\\M'`
  return [
    [
      'funciones',
      `SELECT p.proname AS nombre, pg_get_function_identity_arguments(p.oid) AS args
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
         AND pg_get_functiondef(p.oid) ~* ${re}
       ORDER BY 1`,
    ],
    [
      'triggers',
      `SELECT c.relname AS tabla, t.tgname AS nombre
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND NOT t.tgisinternal
         AND pg_get_triggerdef(t.oid) ~* ${re}
       ORDER BY 1, 2`,
    ],
    [
      'vistas',
      `SELECT schemaname || '.' || viewname AS nombre FROM pg_views
       WHERE schemaname = 'public' AND definition ~* ${re}
       UNION ALL
       SELECT schemaname || '.' || matviewname FROM pg_matviews
       WHERE schemaname = 'public' AND definition ~* ${re}
       ORDER BY 1`,
    ],
    [
      'políticas RLS',
      `SELECT tablename AS tabla, policyname AS nombre FROM pg_policies
       WHERE schemaname = 'public'
         AND (COALESCE(qual, '') ~* ${re} OR COALESCE(with_check, '') ~* ${re})
       ORDER BY 1, 2`,
    ],
    [
      'restricciones',
      `SELECT conrelid::regclass::text AS tabla, conname AS nombre, pg_get_constraintdef(oid) AS definicion
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND pg_get_constraintdef(oid) ~* ${re}
       ORDER BY 1, 2`,
    ],
    [
      'índices',
      `SELECT tablename AS tabla, indexname AS nombre, indexdef AS definicion FROM pg_indexes
       WHERE schemaname = 'public' AND indexdef ~* ${re}
       ORDER BY 1, 2`,
    ],
    [
      'pg_depend (sobre la columna)',
      `SELECT d.classid::regclass::text AS clase, d.objid, d.deptype
       FROM pg_depend d
       JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
       WHERE d.refobjid = 'public.${tabla}'::regclass AND a.attname = '${columna}'
         AND d.classid <> 'pg_attrdef'::regclass
       ORDER BY 1, 2`,
    ],
  ]
}

async function main() {
  const { soloRepo, projectRef, objetivo } = parseArgs(process.argv.slice(2))
  if (!objetivo || (!soloRepo && !projectRef)) uso()

  const [tabla, columna, extra] = objetivo.split('.')
  if (!tabla || !columna || extra !== undefined || !IDENT.test(tabla) || !IDENT.test(columna)) {
    console.error(`"${objetivo}" no es <tabla.columna> (solo a-z, 0-9 y _).`)
    process.exit(2)
  }

  let total = 0

  const repo = buscarEnRepo(columna)
  console.log(`\n== código del repo (${repo.length}) ==`)
  repo.forEach((l) => console.log(`  ${l}`))
  total += repo.length

  if (!soloRepo) {
    const token = process.env.SUPABASE_ACCESS_TOKEN
    if (!token) {
      console.error('Falta SUPABASE_ACCESS_TOKEN (Dashboard de Supabase -> Account -> Access Tokens).')
      process.exit(2)
    }
    for (const [titulo, query] of consultasCatalogo(tabla, columna)) {
      const filas = await consultar(projectRef, token, query)
      console.log(`\n== ${titulo} (${filas.length}) ==`)
      filas.forEach((f) => console.log(`  ${Object.values(f).join(' | ')}`))
      total += filas.length
    }
  }

  console.log(`\n${total === 0 ? 'Mapa en cero.' : `${total} dependencia(s) mencionan "${columna}" — revisar una por una.`}`)
  process.exit(total === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(2)
})
