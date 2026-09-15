/**
 * EF-3A 3A-4: crea la carpeta de Drive real de una corrida de carga
 * (`loadtest-${runId}`) llamando POST /api/internal/loadtest-drive-folder
 * -- ese endpoint SÍ puede importar lib/integrations/google/drive.ts (corre
 * dentro de Next.js), este script `.mjs` plano no. Registra el ID real
 * (nunca el nombre) en `loadtest_runs`, vía @supabase/supabase-js directo
 * -- mismo patrón que bulk-cleanup.mjs/prepare-portal-fixtures.mjs ya usan
 * para hablar con Postgres desde un script plano.
 *
 * Imprime el `folderId` real a stdout en un formato que el orquestador del
 * workflow captura y reenvía a k6 (3A-5) como variable de entorno
 * (`--env LOADTEST_DRIVE_FOLDER_ID=<id-real>`).
 *
 * Uso:
 *   node scripts/loadtest/create-drive-run-folder.mjs --target-url <url> --run-id <uuid>
 *
 * Requiere: LOADTEST_ENV_SECRET, TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const targetUrl = get('--target-url')
  const runId = get('--run-id')
  if (!targetUrl || !runId) {
    console.error('Uso: node scripts/loadtest/create-drive-run-folder.mjs --target-url <url> --run-id <uuid>')
    process.exit(1)
  }
  return { targetUrl: targetUrl.replace(/\/$/, ''), runId }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`create-drive-run-folder: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const { targetUrl, runId } = parseArgs()
  const loadtestEnvSecret = requireEnv('LOADTEST_ENV_SECRET')
  const supabaseUrl = requireEnv('TEST_SUPABASE_URL')
  const serviceRoleKey = requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const res = await fetch(`${targetUrl}/api/internal/loadtest-drive-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-loadtest-secret': loadtestEnvSecret },
    body: JSON.stringify({ runId }),
  })
  if (!res.ok) {
    throw new Error(
      `create-drive-run-folder: /api/internal/loadtest-drive-folder respondió ${res.status} en ${targetUrl}`
    )
  }
  const { folderId } = await res.json()
  if (!folderId) {
    throw new Error('create-drive-run-folder: la respuesta no trajo folderId')
  }

  const { error } = await supabaseAdmin
    .from('loadtest_runs')
    .insert({ run_id: runId, drive_folder_id: folderId })
  if (error) {
    throw new Error(`create-drive-run-folder: fallo registrando la corrida en loadtest_runs: ${error.message}`)
  }

  console.log(`create-drive-run-folder: carpeta real creada y registrada`)
  console.log(`LOADTEST_DRIVE_FOLDER_ID=${folderId}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
