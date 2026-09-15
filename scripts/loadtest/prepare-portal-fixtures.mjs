/**
 * EF-3A 3A-2: crea `--count` proveedores efímeros directo en Postgres y les
 * firma una cookie de sesión real del Portal, sin pasar por
 * /api/portal/login -- el login real tiene rate limit
 * (checkRateLimit('portal-login:ip', 20, 900) / ('portal-login:email', 5,
 * 900), db/migrations/20260909_rate_limits.sql) que 100-200 VUs de k6
 * agotarían de inmediato.
 *
 * Script Node plano (`.mjs`, sin tsx/ts-node en package.json, sin alias
 * `@/` resoluble fuera de Next.js) -- no puede importar lib/portal-auth.ts
 * directo. Para no reimplementar la firma HMAC en JS plano (arriesgaría
 * que diverja de la real con el tiempo), pide la cookie a
 * POST /api/internal/loadtest-portal-session, que SÍ corre dentro de
 * Next.js y llama signPortalSession() real sin reimplementarla.
 *
 * Uso:
 *   node scripts/loadtest/prepare-portal-fixtures.mjs \
 *     --target-url <url> --run-id <uuid> --count 150 --out <path>
 *
 * Requiere en el entorno: LOADTEST_ENV_SECRET, TEST_SUPABASE_URL,
 * TEST_SUPABASE_SERVICE_ROLE_KEY.
 */
import { writeFile } from 'fs/promises'
import { createClient } from '@supabase/supabase-js'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const targetUrl = get('--target-url')
  const runId = get('--run-id')
  const count = Number(get('--count') ?? '150')
  const outPath = get('--out')

  if (!targetUrl || !runId || !outPath || !Number.isInteger(count) || count < 1) {
    console.error(
      'Uso: node scripts/loadtest/prepare-portal-fixtures.mjs --target-url <url> ' +
      '--run-id <uuid> --count 150 --out <path>'
    )
    process.exit(1)
  }
  return { targetUrl: targetUrl.replace(/\/$/, ''), runId, count, outPath }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`prepare-portal-fixtures: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

// sessionVersion fijo en 1 -- las filas se crean explícitamente con
// session_version=1 (no el default 0 de la columna) para que el payload de
// POST /api/internal/loadtest-portal-session, validado con
// LoadtestPortalSessionSchema (positive int), coincida siempre.
const FIXTURE_SESSION_VERSION = 1

async function main() {
  const { targetUrl, runId, count, outPath } = parseArgs()
  const loadtestEnvSecret = requireEnv('LOADTEST_ENV_SECRET')
  const supabaseUrl = requireEnv('TEST_SUPABASE_URL')
  const serviceRoleKey = requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY')

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const rows = Array.from({ length: count }, (_, idx) => {
    const n = idx + 1
    return {
      nombre: `LOADTEST-${runId}-Proveedor-${n}`,
      correo: `LOADTEST-${runId}-${n}@proveedor.test`,
      activo: true,
      session_version: FIXTURE_SESSION_VERSION,
      // 'activo' (no NULL/'pendiente_confirmacion'): representa un proveedor
      // que ya completó el signup del Portal -- GET /api/portal/me exige
      // portal_estado !== null además de requirePortalSession() (encontrado
      // en la validación real de este bloque: sin esto, /me devuelve 401
      // "No autenticado" aunque la cookie firmada sea válida). Las otras
      // rutas que k6 (3A-5) ejercita (perfil, cuentas, documentos) no
      // exigen este campo, pero un proveedor de fixture sin cuenta de
      // portal completa no representa el tráfico real que la suite simula.
      portal_estado: 'activo',
    }
  })

  console.log(`prepare-portal-fixtures: insertando ${count} proveedores de fixture en Postgres`)
  const { data: proveedores, error } = await supabaseAdmin
    .from('proveedores')
    .insert(rows)
    .select('id')
  if (error) {
    throw new Error(`prepare-portal-fixtures: fallo al insertar proveedores: ${error.message}`)
  }
  if (proveedores.length !== count) {
    throw new Error(
      `prepare-portal-fixtures: se insertaron ${proveedores.length} de ${count} proveedores esperados`
    )
  }

  const sessions = []
  for (const [idx, { id: proveedorId }] of proveedores.entries()) {
    const res = await fetch(`${targetUrl}/api/internal/loadtest-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-loadtest-secret': loadtestEnvSecret,
      },
      body: JSON.stringify({ proveedorId, sessionVersion: FIXTURE_SESSION_VERSION }),
    })
    if (!res.ok) {
      throw new Error(
        `prepare-portal-fixtures: /api/internal/loadtest-portal-session respondió ${res.status} ` +
        `para proveedor ${proveedorId} -- ¿LOADTEST_MODE/LOADTEST_ENV_SECRET mal configurados en ${targetUrl}?`
      )
    }
    const { cookieValue } = await res.json()
    sessions.push({ proveedorId, cookieValue })
    if ((idx + 1) % 25 === 0 || idx + 1 === proveedores.length) {
      console.log(`prepare-portal-fixtures: sesión ${idx + 1}/${proveedores.length} lista`)
    }
  }

  await writeFile(outPath, JSON.stringify(sessions, null, 2))
  console.log(`prepare-portal-fixtures: ${sessions.length} sesiones escritas en ${outPath}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
