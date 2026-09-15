/**
 * EF-3A 3A-2: crea `--count` identidades de staff efímeras y las loguea
 * vía REST, escribiendo sus cookies de sesión a un archivo JSON.
 *
 * Por qué hacen falta identidades distintas: `editar-concurrente.js`
 * (3A-5) simula varios usuarios editando la MISMA cotización a la vez --
 * Presence identifica por `identity.userId` (`useQuotationPresence.ts`),
 * así que reusar una sola cuenta para todas las VUs de ese escenario sería
 * indistinguible de un solo usuario editando, no de una colaboración real.
 *
 * Por qué el login pasa por este script y no por k6: k6 no puede repetir
 * el handshake CSRF completo (GET csrf + POST credentials) por cada VU sin
 * duplicar esa lógica dentro del propio script de carga -- las cookies ya
 * firmadas viajan listas en el archivo de salida, que k6 lee una sola vez
 * en su fase de inicialización vía `SharedArray`/`open()`.
 *
 * Uso:
 *   node scripts/loadtest/prepare-staff-fixtures.mjs \
 *     --target-url <url> --run-id <uuid> --count 10 --out <path>
 *
 * Requiere en el entorno: PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD
 * (la cuenta admin que crea los usuarios efímeros -- confirmada con
 * sección `admin` por env-check.mjs antes de correr este script).
 */
import { writeFile } from 'fs/promises'
import { loginRest } from './rest-login.mjs'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const targetUrl = get('--target-url')
  const runId = get('--run-id')
  const count = Number(get('--count') ?? '10')
  const outPath = get('--out')

  if (!targetUrl || !runId || !outPath || !Number.isInteger(count) || count < 1) {
    console.error(
      'Uso: node scripts/loadtest/prepare-staff-fixtures.mjs --target-url <url> ' +
      '--run-id <uuid> --count 10 --out <path>'
    )
    process.exit(1)
  }
  return { targetUrl: targetUrl.replace(/\/$/, ''), runId, count, outPath }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`prepare-staff-fixtures: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const { targetUrl, runId, count, outPath } = parseArgs()
  const adminEmail = requireEnv('PLAYWRIGHT_TEST_EMAIL')
  const adminPassword = requireEnv('PLAYWRIGHT_TEST_PASSWORD')

  console.log(`prepare-staff-fixtures: login admin (${adminEmail}) contra ${targetUrl}`)
  const adminCookie = await loginRest(targetUrl, adminEmail, adminPassword)

  const identities = []
  for (let i = 1; i <= count; i++) {
    const email = `loadtest-${runId}-${i}@serenata.test`
    const password = `Loadtest-${runId.slice(0, 8)}-${i}!`

    const createRes = await fetch(`${targetUrl}/api/admin/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        email,
        name: `Loadtest identidad ${i}`,
        password,
        sections: ['cotizaciones'],
      }),
    })
    if (createRes.status === 403) {
      throw new Error(
        `prepare-staff-fixtures: ${adminEmail} no tiene sección admin en ${targetUrl} -- ` +
        'env-check.mjs debió haber abortado antes de llegar aquí'
      )
    }
    if (!createRes.ok) {
      // Un 409 aquí es una colisión real (runId es un UUID nuevo por
      // corrida) -- nunca se asume que la fila existente comparte esta
      // password, se falla explícito en vez de intentar loguear con una
      // credencial que puede no coincidir.
      throw new Error(
        `prepare-staff-fixtures: no se pudo crear ${email} (status ${createRes.status}): ` +
        (await createRes.text())
      )
    }

    const cookie = await loginRest(targetUrl, email, password)
    identities.push({ email, cookie })
    console.log(`prepare-staff-fixtures: identidad ${i}/${count} lista (${email})`)
  }

  await writeFile(outPath, JSON.stringify(identities, null, 2))
  console.log(`prepare-staff-fixtures: ${identities.length} identidades escritas en ${outPath}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
