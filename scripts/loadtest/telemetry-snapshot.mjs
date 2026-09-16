/**
 * EF-3A 3A-5: snapshot completo de pg_stat_statements (RPC
 * pg_stat_statements_snapshot(), universo completo, no top-N) -- se llama
 * una vez antes de arrancar k6 y una vez después, para que
 * telemetry-deltas.mjs calcule los deltas reales de la ventana de carga.
 *
 * Uso:
 *   node scripts/loadtest/telemetry-snapshot.mjs --out <path>
 *
 * Requiere: TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY.
 */
import { writeFile } from 'fs/promises'
import { createClient } from '@supabase/supabase-js'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const outPath = get('--out')
  if (!outPath) {
    console.error('Uso: node scripts/loadtest/telemetry-snapshot.mjs --out <path>')
    process.exit(1)
  }
  return { outPath }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`telemetry-snapshot: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const { outPath } = parseArgs()
  const supabaseUrl = requireEnv('TEST_SUPABASE_URL')
  const serviceRoleKey = requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await supabaseAdmin.rpc('pg_stat_statements_snapshot')
  if (error) {
    throw new Error(`telemetry-snapshot: fallo llamando la RPC: ${error.message}`)
  }

  const snapshot = { taken_at: new Date().toISOString(), rows: data }
  await writeFile(outPath, JSON.stringify(snapshot, null, 2))
  console.log(`telemetry-snapshot: ${data.length} filas escritas en ${outPath}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
