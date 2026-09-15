/**
 * EF-3A 3A-1: verifica GET /api/internal/env-check contra un entorno de
 * carga (local o el proyecto Vercel aislado de loadtest) ANTES de que
 * reciba tráfico de k6. Aborta con código de error si el entorno resulta
 * ser producción, si cualquier credencial no coincide con la de
 * serenata-erp-test, o si la cuenta de staff de test no tiene permiso
 * admin -- 3A-2 lo necesita para crear los 10 usuarios efímeros de
 * identidad vía POST /api/admin/usuarios.
 *
 * Uso:
 *   node scripts/loadtest/env-check.mjs --target-url <url>
 *
 * Requiere en el entorno: LOADTEST_ENV_SECRET, TEST_SUPABASE_ANON_KEY,
 * TEST_SUPABASE_SERVICE_ROLE_KEY, DRIVE_TEST_FOLDER_ID,
 * TEST_SHEETS_SPREADSHEET_ID, PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD.
 */
import { createHash } from 'crypto'

function parseArgs() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--target-url')
  const targetUrl = i >= 0 ? args[i + 1] : null
  if (!targetUrl) {
    console.error('Uso: node scripts/loadtest/env-check.mjs --target-url <url>')
    process.exit(1)
  }
  return { targetUrl: targetUrl.replace(/\/$/, '') }
}

function requireEnv(name) {
  // .trim() también quita LINE SEPARATOR (U+2028)/PARAGRAPH SEPARATOR
  // (U+2029) -- un artefacto real de copiar/pegar un secreto desde ciertas
  // apps/terminales que Node no puede meter en un header HTTP
  // ("Cannot convert argument to a ByteString"), visto en un run real de
  // load-test.yml.
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`env-check: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 8)
}

// fetch nativo de Node no combina múltiples Set-Cookie en headers.get() --
// getSetCookie() sí devuelve cada uno por separado, necesario para
// mantener tanto la cookie de csrf como la de sesión en el mismo jar.
function extractCookies(response) {
  return response.headers.getSetCookie().map((c) => c.split(';')[0])
}

async function main() {
  const { targetUrl } = parseArgs()
  const loadtestEnvSecret = requireEnv('LOADTEST_ENV_SECRET')
  const testAnonKey = requireEnv('TEST_SUPABASE_ANON_KEY')
  const testServiceRoleKey = requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY')
  const driveTestFolderId = requireEnv('DRIVE_TEST_FOLDER_ID')
  const testSheetsSpreadsheetId = requireEnv('TEST_SHEETS_SPREADSHEET_ID')
  const playwrightEmail = requireEnv('PLAYWRIGHT_TEST_EMAIL')
  const playwrightPassword = requireEnv('PLAYWRIGHT_TEST_PASSWORD')

  console.log(`env-check: verificando ${targetUrl}`)

  const checkRes = await fetch(`${targetUrl}/api/internal/env-check`, {
    headers: { 'x-loadtest-secret': loadtestEnvSecret },
  })
  if (!checkRes.ok) {
    console.error(
      `env-check: /api/internal/env-check respondió ${checkRes.status} en ${targetUrl} -- ` +
      '¿LOADTEST_MODE/LOADTEST_ENV_SECRET mal configurados ahí?'
    )
    process.exit(1)
  }
  const body = await checkRes.json()

  if (body.isProductionProject) {
    console.error(`env-check: ${targetUrl} apunta al proyecto Supabase de PRODUCCIÓN -- abortando`)
    process.exit(1)
  }

  const expected = {
    supabaseAnonKeyFingerprint: fingerprint(testAnonKey),
    supabaseServiceRoleKeyFingerprint: fingerprint(testServiceRoleKey),
    driveFolderId: driveTestFolderId,
    driveFolderIdCuentas: driveTestFolderId,
    sheetsSpreadsheetId: testSheetsSpreadsheetId,
    authSecretConfigured: true,
  }

  const mismatches = Object.entries(expected).filter(([key, value]) => body[key] !== value)
  if (mismatches.length > 0) {
    console.error(
      `env-check: ${targetUrl} no coincide con serenata-erp-test en: ` +
      mismatches.map(([key]) => key).join(', ')
    )
    process.exit(1)
  }

  // Login REST de la cuenta de staff sin identidad distinta (mismo patrón
  // que .github/workflows/preview-latency.yml, portado a Node porque este
  // script corre fuera de un step de shell) + verificación de permiso
  // admin real vía GET /api/admin/usuarios.
  const csrfRes = await fetch(`${targetUrl}/api/auth/csrf`)
  if (!csrfRes.ok) {
    console.error(`env-check: no se pudo obtener csrf token de ${targetUrl} (status ${csrfRes.status})`)
    process.exit(1)
  }
  const jar = extractCookies(csrfRes)
  const { csrfToken } = await csrfRes.json()

  const loginRes = await fetch(`${targetUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.join('; '),
    },
    body: new URLSearchParams({
      csrfToken,
      email: playwrightEmail,
      password: playwrightPassword,
      callbackUrl: `${targetUrl}/`,
      json: 'true',
    }),
  })
  jar.push(...extractCookies(loginRes))

  const adminRes = await fetch(`${targetUrl}/api/admin/usuarios`, {
    headers: { Cookie: jar.join('; ') },
  })
  if (adminRes.status === 403) {
    console.error(
      `env-check: la cuenta de staff de serenata-erp-test (${playwrightEmail}) no tiene la sección admin ` +
      '-- 3A-2 no podrá crear las fixtures de identidad'
    )
    process.exit(1)
  }
  if (!adminRes.ok) {
    console.error(`env-check: login falló contra ${targetUrl} (GET /api/admin/usuarios respondió ${adminRes.status})`)
    process.exit(1)
  }

  console.log(`env-check: ${targetUrl} OK`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
