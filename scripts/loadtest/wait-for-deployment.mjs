/**
 * EF-3A 3A-1: espera a que un deployment de Vercel (proyecto aislado de
 * loadtest) llegue a READY para un SHA exacto, antes de que
 * `pin-loadtest-target` deje avanzar cualquier job de k6. Este repo no
 * tenía ningún precedente de polling contra la API de Vercel -- se define
 * acá desde cero, sin ambigüedad de estados/timeout.
 *
 * Uso:
 *   node scripts/loadtest/wait-for-deployment.mjs \
 *     --project-id <id> --sha <sha> --timeout-seconds 300 [--team-id <id>]
 *
 * Requiere VERCEL_TOKEN en el entorno.
 */
const POLL_INTERVAL_MS = 5000
const TERMINAL_STATES = new Set(['READY', 'ERROR', 'CANCELED'])

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }

  const projectId = get('--project-id')
  const sha = get('--sha')
  const timeoutSeconds = Number(get('--timeout-seconds') ?? '300')
  const teamId = get('--team-id')

  if (!projectId || !sha) {
    console.error(
      'Uso: node scripts/loadtest/wait-for-deployment.mjs --project-id <id> --sha <sha> ' +
      '--timeout-seconds 300 [--team-id <id>]'
    )
    process.exit(1)
  }

  return { projectId, sha, timeoutSeconds, teamId }
}

async function waitForDeployment(projectId, sha, timeoutSeconds, vercelToken, teamId) {
  const teamParam = teamId ? `&teamId=${teamId}` : ''
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&meta-githubCommitSha=${sha}&limit=1${teamParam}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    )
    if (!res.ok) throw new Error(`Vercel API respondió ${res.status} consultando deployments: ${await res.text()}`)
    const { deployments } = await res.json()
    const deployment = deployments[0]
    if (!deployment) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      continue // el deploy puede tardar unos segundos en aparecer tras el push
    }
    if (deployment.readyState === 'READY') return deployment
    if (TERMINAL_STATES.has(deployment.readyState)) {
      throw new Error(`Deployment de Vercel terminó en estado ${deployment.readyState} (sha ${sha}) -- no se lanza k6 contra un deploy fallido`)
    }
    // BUILDING / QUEUED / INITIALIZING: sigue esperando
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  // Diagnóstico antes de fallar: distinguir "el proyecto/team-id de la
  // consulta no tiene NINGÚN deployment visible" (probable project-id/
  // team-id mal configurado) de "el SHA nunca apareció" (el deploy
  // pertenece a otro branch/proyecto, o Vercel no lo disparó) -- un
  // simple "Timeout" no distingue estos dos casos reales muy distintos.
  let diagnostic = ''
  try {
    const debugRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5${teamParam}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    )
    if (debugRes.ok) {
      const { deployments } = await debugRes.json()
      diagnostic = deployments.length === 0
        ? ' -- 0 deployments visibles para este projectId/teamId (revisar LOADTEST_VERCEL_PROJECT_ID/LOADTEST_VERCEL_TEAM_ID)'
        : ` -- ${deployments.length} deployment(s) recientes visibles, ninguno con sha ${sha} (shas: ${deployments.map((d) => d.meta?.githubCommitSha ?? '?').join(', ')})`
    } else {
      diagnostic = ` -- diagnóstico también falló: Vercel API respondió ${debugRes.status}`
    }
  } catch (diagErr) {
    diagnostic = ` -- diagnóstico también falló: ${diagErr.message}`
  }

  throw new Error(`Timeout de ${timeoutSeconds}s esperando el deployment del sha ${sha}${diagnostic} -- ver el dashboard de Vercel manualmente antes de reintentar`)
}

async function main() {
  const { projectId, sha, timeoutSeconds, teamId } = parseArgs()
  const vercelToken = process.env.VERCEL_TOKEN
  if (!vercelToken) {
    console.error('wait-for-deployment: falta VERCEL_TOKEN en el entorno')
    process.exit(1)
  }

  console.log(`wait-for-deployment: esperando READY para sha ${sha} en proyecto ${projectId}...`)
  const deployment = await waitForDeployment(projectId, sha, timeoutSeconds, vercelToken, teamId)
  console.log(`wait-for-deployment: READY -- ${deployment.url}`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
