/**
 * EF-3 3C-4 (diagnóstico F15c): el gate de duración de syncAllDown() reveló
 * que las 9 tablas fallan con "Requested entity was not found" contra el
 * spreadsheet configurado en TEST_SHEETS_SPREADSHEET_ID -- el ID actual no
 * es accesible con las credenciales de Google del entorno de loadtest
 * (nadie lo había ejercitado antes: el job `live` de e2e.yml nunca usa
 * Sheets). Este script llama POST /api/integrations/sheets/setup contra el
 * propio entorno objetivo -- crea un spreadsheet nuevo usando EXACTAMENTE
 * las credenciales que después van a leerlo/escribirlo, así que el ID que
 * devuelve está garantizado accesible, sin adivinar la causa exacta
 * (¿ID mal copiado? ¿archivo borrado? ¿scope insuficiente?).
 *
 * El ID resultante hay que guardarlo a mano como TEST_SHEETS_SPREADSHEET_ID
 * (GitHub secret) y como GOOGLE_SHEETS_SPREADSHEET_ID (env var persistente
 * del proyecto Vercel serenata-erp-loadtest) -- ninguna API disponible en
 * esta sesión puede escribir esos dos lugares.
 *
 * Uso:
 *   node scripts/loadtest/reset-sheets-integration.mjs --target-url <url>
 *
 * Requiere: PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD.
 */
import { loginRest } from './rest-login.mjs'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const targetUrl = get('--target-url')
  if (!targetUrl) {
    console.error('Uso: node scripts/loadtest/reset-sheets-integration.mjs --target-url <url>')
    process.exit(1)
  }
  return { targetUrl: targetUrl.replace(/\/$/, '') }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`reset-sheets-integration: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const { targetUrl } = parseArgs()
  const adminEmail = requireEnv('PLAYWRIGHT_TEST_EMAIL')
  const adminPassword = requireEnv('PLAYWRIGHT_TEST_PASSWORD')

  console.log(`reset-sheets-integration: login admin (${adminEmail}) contra ${targetUrl}`)
  const cookie = await loginRest(targetUrl, adminEmail, adminPassword)

  console.log('reset-sheets-integration: POST /api/integrations/sheets/setup (crea spreadsheet nuevo + sync inicial)...')
  const res = await fetch(`${targetUrl}/api/integrations/sheets/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title: `Serenata ERP — Loadtest (reset ${new Date().toISOString().split('T')[0]})` }),
  })
  const bodyText = await res.text()

  if (!res.ok) {
    console.error(`reset-sheets-integration: POST falló (status ${res.status}): ${bodyText}`)
    process.exit(1)
  }

  let body
  try { body = JSON.parse(bodyText) } catch { body = null }

  if (!body?.spreadsheetId) {
    console.error(`reset-sheets-integration: respuesta sin spreadsheetId: ${bodyText}`)
    process.exit(1)
  }

  console.log(`reset-sheets-integration: spreadsheet nuevo creado -- id=${body.spreadsheetId}`)
  console.log(`reset-sheets-integration: url=${body.url}`)
  if (body.syncSummary) {
    console.log(`reset-sheets-integration: sync inicial -- totalRows=${body.syncSummary.totalRows} errors=${body.syncSummary.errors}`)
    if (body.syncSummary.errors > 0) {
      for (const r of body.syncSummary.results ?? []) {
        if (!r.ok) console.log(`reset-sheets-integration:   tabla ${r.tab}: error=${r.error}`)
      }
      console.error('reset-sheets-integration: el spreadsheet nuevo se creó pero el sync inicial también falló -- revisar credenciales de Google del entorno, no solo el ID')
      process.exit(1)
    }
  }
  console.log('reset-sheets-integration: ACCION MANUAL REQUERIDA -- guardar este spreadsheetId como:')
  console.log(`reset-sheets-integration:   1. GitHub secret TEST_SHEETS_SPREADSHEET_ID = ${body.spreadsheetId}`)
  console.log('reset-sheets-integration:   2. Vercel (proyecto serenata-erp-loadtest) -> env var GOOGLE_SHEETS_SPREADSHEET_ID, mismo valor')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
