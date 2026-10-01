/**
 * Foto dorada "antes = después" de las RPCs de lectura (PLAN.md, B0 / H1, K3).
 *
 * Corre scripts/db/foto-dorada.sql (fecha fija, sin cambiar nada en la BD) y
 * guarda o compara la salida de cada RPC de lectura.
 *
 *   # Justo ANTES de aplicar la migración de un bloque:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db/foto-dorada.mjs <ref> --guardar antes.json --completo
 *   # Justo DESPUÉS (misma BD, sin otras escrituras de por medio):
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db/foto-dorada.mjs <ref> --comparar antes.json \
 *     [--renombres x_pagar=costo_total,otro=nuevo]
 *
 * Sin --completo guarda solo huellas (md5 por llamada): detecta CUALQUIER
 * diferencia pero no dice cuál. Con --completo guarda el JSON de cada llamada y
 * --comparar lista las rutas de campo que cambiaron. Las diferencias permitidas
 * son solo las que el PR de la migración declara: nombres de campo renombrados
 * (--renombres, vieja=nueva) y el formato de timestamptz (se normaliza a
 * instante UTC).
 *
 * Importante: la foto sirve solo si nadie escribe entre las dos tomas (los
 * specs `live` y la app crean y borran filas). Tómala justo antes y después.
 * Exit code 1 si hay diferencias.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function args() {
  const a = process.argv.slice(2)
  const valor = (flag) => {
    const i = a.indexOf(flag)
    return i >= 0 ? a[i + 1] : null
  }
  return {
    ref: a[0] && !a[0].startsWith('--') ? a[0] : null,
    guardar: valor('--guardar'),
    comparar: valor('--comparar'),
    completo: a.includes('--completo'),
    renombres: Object.fromEntries(
      (valor('--renombres') ?? '').split(',').filter(Boolean).map((p) => p.split('=')),
    ),
  }
}

async function tomarFoto(ref, token, completo) {
  let sql = readFileSync(join(__dirname, 'foto-dorada.sql'), 'utf8')
  if (completo) sql = sql.replace("'FOTO_DORADA:%', v_hash;", "'FOTO_DORADA:%', v_full;")
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const texto = await res.text()
  // El bloque termina con RAISE EXCEPTION a propósito: el JSON viene en el mensaje de error.
  const i = texto.indexOf('FOTO_DORADA:')
  if (i < 0) throw new Error(`La foto no devolvió datos (HTTP ${res.status}): ${texto.slice(0, 500)}`)
  let cuerpo = texto.slice(i + 'FOTO_DORADA:'.length)
  // El mensaje es una cadena JSON-escapada dentro del error de la API; se corta antes de CONTEXT.
  try {
    cuerpo = JSON.parse(`"${cuerpo.split(/\\nCONTEXT:|\nCONTEXT:/)[0].replace(/"$/, '')}"`)
  } catch {
    cuerpo = cuerpo.split(/\\nCONTEXT:|\nCONTEXT:/)[0]
  }
  return JSON.parse(cuerpo)
}

const ISO_TS = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)$/

function normalizar(v, renombres) {
  if (Array.isArray(v)) return v.map((x) => normalizar(x, renombres))
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .map(([k, x]) => [renombres[k] ?? k, normalizar(x, renombres)])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    )
  }
  if (typeof v === 'string' && ISO_TS.test(v)) {
    const t = Date.parse(v.replace(' ', 'T'))
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  return v
}

function diferencias(a, b, ruta, salida) {
  if (salida.length >= 40) return
  if (JSON.stringify(a) === JSON.stringify(b)) return
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) salida.push(`${ruta}: longitud ${a.length} → ${b.length}`)
    for (let i = 0; i < Math.min(a.length, b.length); i++) diferencias(a[i], b[i], `${ruta}[${i}]`, salida)
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) salida.push(`${ruta}.${k}: solo después`)
      else if (!(k in b)) salida.push(`${ruta}.${k}: solo antes`)
      else diferencias(a[k], b[k], `${ruta}.${k}`, salida)
    }
    return
  }
  salida.push(`${ruta}: ${JSON.stringify(a)?.slice(0, 80)} → ${JSON.stringify(b)?.slice(0, 80)}`)
}

async function main() {
  const o = args()
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!o.ref || !token || (!o.guardar && !o.comparar)) {
    console.error('Uso: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db/foto-dorada.mjs <ref> (--guardar f.json [--completo] | --comparar f.json [--renombres a=b])')
    process.exit(2)
  }

  if (o.guardar) {
    const foto = await tomarFoto(o.ref, token, o.completo)
    writeFileSync(o.guardar, JSON.stringify({ completo: o.completo, foto }))
    console.log(`Foto guardada en ${o.guardar}: ${Object.keys(foto).length} llamadas (${o.completo ? 'completa' : 'solo huellas'}).`)
    return
  }

  const antes = JSON.parse(readFileSync(o.comparar, 'utf8'))
  const despues = await tomarFoto(o.ref, token, antes.completo)
  const claves = new Set([...Object.keys(antes.foto), ...Object.keys(despues)])
  let cambios = 0
  for (const k of [...claves].sort()) {
    if (!(k in antes.foto) || !(k in despues)) {
      console.error(`- ${k}: solo en ${k in antes.foto ? 'antes' : 'después'}`)
      cambios++
      continue
    }
    if (antes.completo) {
      const a = normalizar(antes.foto[k], {})
      const b = normalizar(despues[k], o.renombres)
      const d = []
      diferencias(a, b, k, d)
      if (d.length) {
        cambios++
        d.forEach((l) => console.error(`- ${l}`))
      }
    } else if (antes.foto[k].md5 !== despues[k].md5) {
      cambios++
      console.error(`- ${k}: huella distinta (${antes.foto[k].bytes} → ${despues[k].bytes} bytes)`)
    }
  }
  if (cambios === 0) console.log(`OK -- ${claves.size} llamadas idénticas antes y después.`)
  else console.error(`\n${cambios} llamada(s) con diferencias: solo se permiten las declaradas en el PR.`)
  process.exit(cambios === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(2)
})
