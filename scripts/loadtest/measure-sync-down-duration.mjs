/**
 * EF-3 3C-4: gate obligatorio -- medir duración real de syncAllDown()
 * (POST /api/integrations/sheets/sync-down) contra el volumen objetivo ya
 * sembrado (Bloque 4: proveedores=1200, cotizaciones=1200,
 * items_cotizacion=6000, cuentas_pagar=6000) en el entorno serverless real
 * (serenata-erp-loadtest). Umbral: 50s (el mismo que motiva la cadena de
 * remediación de la spec: subir maxDuration -> chunking -> cursor).
 *
 * Uso:
 *   node scripts/loadtest/measure-sync-down-duration.mjs --target-url <url>
 *
 * Requiere: PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD.
 */
import { loginRest } from './rest-login.mjs'

const THRESHOLD_MS = 50_000

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const targetUrl = get('--target-url')
  if (!targetUrl) {
    console.error('Uso: node scripts/loadtest/measure-sync-down-duration.mjs --target-url <url>')
    process.exit(1)
  }
  return { targetUrl: targetUrl.replace(/\/$/, '') }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`measure-sync-down-duration: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const { targetUrl } = parseArgs()
  const adminEmail = requireEnv('PLAYWRIGHT_TEST_EMAIL')
  const adminPassword = requireEnv('PLAYWRIGHT_TEST_PASSWORD')

  console.log(`measure-sync-down-duration: login admin (${adminEmail}) contra ${targetUrl}`)
  const cookie = await loginRest(targetUrl, adminEmail, adminPassword)

  console.log('measure-sync-down-duration: POST /api/integrations/sheets/sync-down (sincroniza TODAS las tablas)...')
  const start = Date.now()
  const res = await fetch(`${targetUrl}/api/integrations/sheets/sync-down`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({}),
  })
  const durationMs = Date.now() - start
  const bodyText = await res.text()

  if (!res.ok) {
    console.error(`measure-sync-down-duration: POST falló (status ${res.status}) tras ${durationMs}ms: ${bodyText}`)
    process.exit(1)
  }

  let body
  try { body = JSON.parse(bodyText) } catch { body = null }

  console.log(`measure-sync-down-duration: duración real = ${durationMs}ms (${(durationMs / 1000).toFixed(2)}s)`)
  console.log(`measure-sync-down-duration: umbral = ${THRESHOLD_MS}ms (${THRESHOLD_MS / 1000}s)`)
  if (body) {
    console.log(`measure-sync-down-duration: totalRows=${body.totalRows ?? '?'} errors=${body.errors ?? '?'} state=${body.state ?? '?'}`)
  }

  if (durationMs >= THRESHOLD_MS) {
    console.error('measure-sync-down-duration: GATE NO SUPERADO -- duración >= umbral')
    process.exit(1)
  }
  console.log('measure-sync-down-duration: GATE SUPERADO -- duración < umbral')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
