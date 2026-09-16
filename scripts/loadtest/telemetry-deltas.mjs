/**
 * EF-3A 3A-5: calcula deltas reales entre 2 snapshots de
 * pg_stat_statements (antes/después de una corrida de k6) -- nunca usa
 * mean_exec_time del snapshot "después" directo: ese valor es el promedio
 * acumulado desde el último reset del contador, no el promedio de la
 * ventana de carga. window_mean_ms = total_exec_time_delta_ms/calls_delta
 * es la métrica correcta, guardada explícitamente contra división por
 * cero.
 *
 * Un queryid presente en "después" y ausente en "antes" no se etiqueta
 * como genuinamente nuevo con certeza -- puede serlo, o puede ser una
 * entrada vieja que pg_stat_statements.max desalojó (evicción LRU) entre
 * ambos snapshots, reapareciendo con contadores reiniciados desde cero:
 * ambos casos son indistinguibles solo con los 2 snapshots, así que se
 * marca flag:'new_or_reset' (nunca "nuevo" sin calificar) y su delta se
 * calcula igual como el valor completo de "después" (única cifra
 * disponible en cualquiera de los 2 casos).
 *
 * Un queryid en "antes" ausente en "después" se omite -- reciclado por
 * pg_stat_statements.max, no es un error.
 *
 * Uso:
 *   node scripts/loadtest/telemetry-deltas.mjs --before <path> --after <path> --run-id <uuid>
 */
import { mkdir, readFile, writeFile } from 'fs/promises'

export function computeDeltas(beforeRows, afterRows) {
  const beforeByQueryId = new Map(beforeRows.map((r) => [r.queryid, r]))
  const deltas = []

  for (const after of afterRows) {
    const before = beforeByQueryId.get(after.queryid)
    if (!before) {
      deltas.push({
        queryid: after.queryid,
        calls_delta: after.calls,
        total_exec_time_delta_ms: after.total_exec_time,
        window_mean_ms: after.calls > 0 ? after.total_exec_time / after.calls : null,
        flag: 'new_or_reset',
      })
      continue
    }
    const callsDelta = after.calls - before.calls
    const totalExecTimeDelta = after.total_exec_time - before.total_exec_time
    deltas.push({
      queryid: after.queryid,
      calls_delta: callsDelta,
      total_exec_time_delta_ms: totalExecTimeDelta,
      window_mean_ms: callsDelta > 0 ? totalExecTimeDelta / callsDelta : null,
      flag: 'matched',
    })
  }

  deltas.sort((a, b) => b.total_exec_time_delta_ms - a.total_exec_time_delta_ms)
  return deltas
}

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const beforePath = get('--before')
  const afterPath = get('--after')
  const runId = get('--run-id')
  if (!beforePath || !afterPath || !runId) {
    console.error('Uso: node scripts/loadtest/telemetry-deltas.mjs --before <path> --after <path> --run-id <uuid>')
    process.exit(1)
  }
  return { beforePath, afterPath, runId }
}

async function main() {
  const { beforePath, afterPath, runId } = parseArgs()
  const before = JSON.parse(await readFile(beforePath, 'utf8'))
  const after = JSON.parse(await readFile(afterPath, 'utf8'))

  const deltas = computeDeltas(before.rows, after.rows)

  const outDir = 'docs/archive/telemetry'
  await mkdir(outDir, { recursive: true })
  const outPath = `${outDir}/${runId}-pg-stat-deltas.json`
  await writeFile(outPath, JSON.stringify(deltas, null, 2))
  console.log(`telemetry-deltas: ${deltas.length} filas escritas en ${outPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message ?? err)
    process.exit(1)
  })
}
