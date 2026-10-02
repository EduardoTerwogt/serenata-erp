/**
 * Fase 8.7.2: compara `db/migrations/_manifest.json` contra las migraciones
 * realmente aplicadas en un proyecto Supabase (vía la Management API), para
 * detectar el gap que causó el bug real de esta fase -- 2 migraciones
 * probadas en `serenata-erp-test` y commiteadas en el repo, pero nunca
 * promovidas a producción (`delete_item_cotizacion` no existía ahí).
 *
 * Deliberadamente NO corre en el CI ordinario de PRs: necesitaría el token
 * de producción en GitHub Actions, algo que TESTING.md/docs/ENV.md prohíben
 * explícitamente. Está pensado como paso manual antes de mergear a `main`
 * (o, si el usuario lo prefiere, como workflow separado y protegido -- ver
 * docs/ACTIVE_WORK.md, no se implementa acá sin decisión explícita).
 *
 * Comparación por NOMBRE normalizado, no por versión/timestamp completo:
 * cada entorno aplica la misma migración en un momento distinto y Supabase
 * le asigna su propio timestamp de aplicación -- comparar el string
 * completo siempre marcaría desfase falso entre 2 entornos con las mismas
 * migraciones. `db/migrations/YYYYMMDD_nombre.sql` -> `nombre`;
 * remoto `{version, name}` -> `name` tal cual (la Management API ya lo
 * devuelve sin el prefijo de fecha).
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-schema-parity.mjs <project-ref>
 *
 * SUPABASE_ACCESS_TOKEN: token personal de Supabase (Dashboard -> Account ->
 * Access Tokens), nunca commitear. <project-ref> es el ref del proyecto a
 * verificar (ej. el de producción).
 *
 * Exit code 1 si hay migraciones commiteadas que faltan en el proyecto
 * remoto -- pensado para bloquear un merge manual, no para correr en CI.
 *
 * Modo --esquema (PLAN.md, B0 / J11): compara el ESQUEMA REAL de dos proyectos
 * (test vs producción) objeto por objeto -- columnas, índices, restricciones,
 * triggers, políticas y el md5 de cada función -- con scripts/db/esquema-huella.sql.
 * Detecta lo que la comparación por nombre de migración no ve: una migración
 * aplicada a mano en un solo entorno, o aplicada en otro orden.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-schema-parity.mjs --esquema <ref-a> <ref-b>
 *
 * Exit code 1 si hay diferencias.
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, '..', 'db', 'migrations', '_manifest.json')

// Infraestructura que existe SOLO en serenata-erp-test a propósito (PLAN.md, B0):
// `loadtest_runs` (db/migrations/20260915_loadtest_runs.sql) controla las
// corridas de carga, que nunca corren contra producción. No es "faltante en
// prod": se excluye de ambas comparaciones. Además `reset-transaccional.sql` y
// `seed-cuentas-test.sql` usan su ausencia/presencia para distinguir prod de test.
const SOLO_TEST_TABLAS = ['loadtest_runs']
const SOLO_TEST_MIGRACIONES = new Set(['loadtest_runs'])
const esSoloTest = (clave) => SOLO_TEST_TABLAS.some((t) => new RegExp(`\\b${t}`).test(clave))

function normalizeArchivo(nombreArchivo) {
  return nombreArchivo.replace(/^\d{8}_/, '').replace(/\.sql$/, '')
}

async function listarMigracionesRemotas(projectRef, accessToken) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/migrations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Management API respondió ${response.status}: ${body}`)
  }
  return response.json()
}


async function consultarSql(projectRef, accessToken, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Management API respondió ${response.status}: ${body}`)
  }
  return response.json()
}

async function compararEsquema(refA, refB, accessToken) {
  const sql = readFileSync(join(__dirname, 'db', 'esquema-huella.sql'), 'utf8')
  const [filasA, filasB] = await Promise.all([
    consultarSql(refA, accessToken, sql),
    consultarSql(refB, accessToken, sql),
  ])
  const mapa = (filas) => new Map(filas.map((f) => [`${f.tipo} ${f.objeto}`, f.detalle]))
  const a = mapa(filasA)
  const b = mapa(filasB)

  const soloA = [...a.keys()].filter((k) => !b.has(k) && !esSoloTest(k))
  const soloB = [...b.keys()].filter((k) => !a.has(k) && !esSoloTest(k))
  const distintos = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k) && !esSoloTest(k))

  console.log(`Objetos: ${refA} ${a.size}, ${refB} ${b.size}.\n`)
  const bloque = (titulo, claves) => {
    if (claves.length === 0) return
    console.error(`${titulo} (${claves.length}):`)
    claves.forEach((k) => console.error(`  - ${k}`))
    console.error('')
  }
  bloque(`Solo en ${refA}`, soloA)
  bloque(`Solo en ${refB}`, soloB)
  bloque('En ambos pero con definición distinta', distintos)

  if (soloA.length + soloB.length + distintos.length === 0) {
    console.log('OK -- el esquema de public es idéntico en ambos proyectos.')
    return 0
  }
  return 1
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN

  if (process.argv[2] === '--esquema') {
    const [refA, refB] = process.argv.slice(3)
    if (!refA || !refB || !accessToken) {
      console.error('Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-schema-parity.mjs --esquema <ref-a> <ref-b>')
      process.exit(1)
    }
    process.exit(await compararEsquema(refA, refB, accessToken))
  }

  const projectRef = process.argv[2]

  if (!projectRef) {
    console.error('Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-schema-parity.mjs <project-ref>')
    process.exit(1)
  }
  if (!accessToken) {
    console.error('Falta SUPABASE_ACCESS_TOKEN (Dashboard de Supabase -> Account -> Access Tokens).')
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const nombresManifest = new Set(manifest.order.map(normalizeArchivo))

  const remotas = await listarMigracionesRemotas(projectRef, accessToken)
  // El CLI (`supabase db push`) registra `000001` + `20260101_nombre`: se quita la fecha
  // del nombre remoto igual que del local (#124, C3).
  const nombresRemotos = new Set(remotas.map((m) => String(m.name).replace(/^\d{8}_/, '')))

  const faltantesEnRemoto = [...nombresManifest].filter((n) => !nombresRemotos.has(n) && !SOLO_TEST_MIGRACIONES.has(n))
  const noCommiteadasEnRepo = [...nombresRemotos].filter((n) => !nombresManifest.has(n))

  console.log(`Manifest: ${nombresManifest.size} migraciones. Proyecto ${projectRef}: ${nombresRemotos.size} aplicadas.\n`)

  if (faltantesEnRemoto.length > 0) {
    console.error(`Migraciones commiteadas que FALTAN en ${projectRef}:`)
    faltantesEnRemoto.forEach((n) => console.error(`  - ${n}`))
  } else {
    console.log(`OK -- todas las migraciones del manifest están aplicadas en ${projectRef}.`)
  }

  if (noCommiteadasEnRepo.length > 0) {
    // Informativo, no bloqueante: puede ser una migración legítima aplicada
    // fuera del flujo de archivos (como el duplicado benigno detectado en
    // Fase 8.7.2 -- mismo SQL re-ejecutado) o un cambio real sin commitear
    // que sí necesita revisión, pero no impide el borrado de producción.
    console.log(`\nAplicadas en ${projectRef} sin archivo commiteado correspondiente (revisar si aplica):`)
    noCommiteadasEnRepo.forEach((n) => console.log(`  - ${n}`))
  }

  if (faltantesEnRemoto.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
