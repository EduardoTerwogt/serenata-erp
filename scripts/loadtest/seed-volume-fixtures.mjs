/**
 * EF-3A 3A-3: siembra volumen real para ejercer F1 (CxP>500), F2/F5/F7
 * (CxC/Cotizaciones/Proveedores>1,000), F9 (Sheets>5,000 -- vía
 * items_cotizacion, la tabla que Sheets espeja). `serenata-erp-test` trae
 * hoy solo decenas de filas -- insuficiente para medir nada realista.
 *
 * Por qué pasa por la API real y no por INSERT directo en
 * cotizaciones/cuentas_pagar/cuentas_cobrar: crear una cotización de verdad
 * no es un solo INSERT -- `POST /api/cotizaciones` reserva folio
 * (`reserveNextQuotationFolio`), arma el payload
 * (`buildCreateCotizacionPayload`) y lo persiste (`createOrReplaceCotizacion`,
 * `lib/server/quotations/persistence.ts`); aprobar corre la RPC real
 * `approve_cotizacion`, que genera 1 fila en `cuentas_pagar` por cada ítem
 * con `x_pagar>0` y 1 fila en `cuentas_cobrar` por cotización (confirmado
 * en `db/migrations/20260911_approve_cotizacion_restore_proyecto_id.sql`).
 * Reimplementar esa orquestación en JS plano (sin poder importar los `.ts`
 * reales, sin alias `@/` resoluble fuera de Next.js) arriesgaría exactamente
 * la duplicación de lógica que "buscar antes de crear" prohíbe -- en vez de
 * eso, este script hace login REST y llama los mismos 3 endpoints reales
 * que un usuario (o k6 en 3A-5) usaría: POST /api/cotizaciones,
 * POST .../emitir, POST .../aprobar.
 *
 * Diseño uniforme: 1,200 cotizaciones × 5 items cada una (todos con
 * x_pagar>0) cubre los 4 objetivos de una sola pasada --
 * cotizaciones/cuentas_cobrar=1,200 (≥1,200), items_cotizacion=6,000
 * (≥5,500), cuentas_pagar=6,000 (≥600, 1 por item). Los 1,200 proveedores
 * de volumen se insertan directo en Postgres (no hay endpoint de bulk-create
 * de proveedores) y también sirven como pool de `responsable_id` para los
 * items.
 *
 * Uso:
 *   node scripts/loadtest/seed-volume-fixtures.mjs --target-url <url> --run-id <uuid>
 *
 * Requiere: PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD,
 * TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import { loginRest } from './rest-login.mjs'

const PROVEEDORES_TARGET = 1200
const COTIZACIONES_TARGET = 1200
const ITEMS_PER_COTIZACION = 5
const PROVEEDOR_INSERT_BATCH = 300

const TARGETS = {
  proveedores: PROVEEDORES_TARGET,
  cotizaciones: COTIZACIONES_TARGET,
  cuentas_cobrar: COTIZACIONES_TARGET,
  items_cotizacion: COTIZACIONES_TARGET * ITEMS_PER_COTIZACION, // 6,000 >= 5,500
  cuentas_pagar: COTIZACIONES_TARGET * ITEMS_PER_COTIZACION, // 6,000 >= 600 (1 por item, todos con x_pagar>0)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  const targetUrl = get('--target-url')
  const runId = get('--run-id')
  if (!targetUrl || !runId) {
    console.error('Uso: node scripts/loadtest/seed-volume-fixtures.mjs --target-url <url> --run-id <uuid>')
    process.exit(1)
  }
  return { targetUrl: targetUrl.replace(/\/$/, ''), runId }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`seed-volume-fixtures: falta la variable de entorno ${name}`)
    process.exit(1)
  }
  return value
}

function fechaEntregaEn15Dias() {
  const d = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

async function insertarProveedoresDeVolumen(supabaseAdmin, runId, count) {
  const ids = []
  for (let start = 0; start < count; start += PROVEEDOR_INSERT_BATCH) {
    const batchSize = Math.min(PROVEEDOR_INSERT_BATCH, count - start)
    const rows = Array.from({ length: batchSize }, (_, idx) => {
      const n = start + idx + 1
      return {
        nombre: `LOADTEST-${runId}-Proveedor-Volumen-${n}`,
        correo: `LOADTEST-${runId}-vol-${n}@proveedor.test`,
        activo: true,
      }
    })
    const { data, error } = await supabaseAdmin.from('proveedores').insert(rows).select('id')
    if (error) throw new Error(`seed-volume-fixtures: fallo insertando proveedores: ${error.message}`)
    ids.push(...data.map((r) => r.id))
    console.log(`seed-volume-fixtures: proveedores ${ids.length}/${count} insertados`)
  }
  return ids
}

async function crearCotizacionAprobada(targetUrl, cookie, runId, i, proveedorIds) {
  const items = Array.from({ length: ITEMS_PER_COTIZACION }, (_, j) => ({
    descripcion: `LOADTEST-${runId}-Item-${i}-${j + 1}`,
    categoria: 'Producción',
    cantidad: 1,
    precio_unitario: 1000,
    x_pagar: 700,
    responsable_id: proveedorIds[(i * ITEMS_PER_COTIZACION + j) % proveedorIds.length],
  }))

  const createRes = await fetch(`${targetUrl}/api/cotizaciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      cliente: `LOADTEST-${runId}-Cliente-${i}`,
      proyecto: `Proyecto carga ${i}`,
      fecha_entrega: fechaEntregaEn15Dias(),
      items,
    }),
  })
  if (!createRes.ok) {
    throw new Error(`seed-volume-fixtures: POST /api/cotizaciones falló (status ${createRes.status}): ${await createRes.text()}`)
  }
  const { id } = await createRes.json()

  const emitirRes = await fetch(`${targetUrl}/api/cotizaciones/${id}/emitir`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
  if (!emitirRes.ok) {
    throw new Error(`seed-volume-fixtures: POST /api/cotizaciones/${id}/emitir falló (status ${emitirRes.status})`)
  }

  const aprobarRes = await fetch(`${targetUrl}/api/cotizaciones/${id}/aprobar`, {
    method: 'POST',
    headers: { Cookie: cookie },
  })
  if (!aprobarRes.ok) {
    throw new Error(`seed-volume-fixtures: POST /api/cotizaciones/${id}/aprobar falló (status ${aprobarRes.status})`)
  }
}

async function contarFilas(supabaseAdmin, table, column, runId) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .ilike(column, `LOADTEST-${runId}-%`)
  if (error) throw new Error(`seed-volume-fixtures: fallo contando ${table}: ${error.message}`)
  return count ?? 0
}

async function main() {
  const { targetUrl, runId } = parseArgs()
  const adminEmail = requireEnv('PLAYWRIGHT_TEST_EMAIL')
  const adminPassword = requireEnv('PLAYWRIGHT_TEST_PASSWORD')
  const supabaseUrl = requireEnv('TEST_SUPABASE_URL')
  const serviceRoleKey = requireEnv('TEST_SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  console.log(`seed-volume-fixtures: insertando ${PROVEEDORES_TARGET} proveedores de volumen`)
  const proveedorIds = await insertarProveedoresDeVolumen(supabaseAdmin, runId, PROVEEDORES_TARGET)

  console.log(`seed-volume-fixtures: login admin (${adminEmail}) contra ${targetUrl}`)
  const cookie = await loginRest(targetUrl, adminEmail, adminPassword)

  for (let i = 1; i <= COTIZACIONES_TARGET; i++) {
    await crearCotizacionAprobada(targetUrl, cookie, runId, i, proveedorIds)
    if (i % 50 === 0 || i === COTIZACIONES_TARGET) {
      console.log(`seed-volume-fixtures: cotizaciones ${i}/${COTIZACIONES_TARGET} creadas+emitidas+aprobadas`)
    }
  }

  console.log('seed-volume-fixtures: verificando conteos reales post-seed...')
  const conteos = {
    proveedores: await contarFilas(supabaseAdmin, 'proveedores', 'nombre', runId),
    cotizaciones: await contarFilas(supabaseAdmin, 'cotizaciones', 'cliente', runId),
    cuentas_cobrar: await contarFilas(supabaseAdmin, 'cuentas_cobrar', 'cliente', runId),
    items_cotizacion: await contarFilas(supabaseAdmin, 'items_cotizacion', 'descripcion', runId),
    cuentas_pagar: await contarFilas(supabaseAdmin, 'cuentas_pagar', 'item_descripcion', runId),
  }

  const faltantes = Object.entries(TARGETS).filter(([table, target]) => conteos[table] < target)
  console.log('seed-volume-fixtures: conteos post-seed vs objetivo:')
  for (const [table, target] of Object.entries(TARGETS)) {
    console.log(`  ${table}: ${conteos[table]} (objetivo >= ${target})`)
  }
  if (faltantes.length > 0) {
    console.error(`seed-volume-fixtures: no se alcanzó el objetivo en: ${faltantes.map(([t]) => t).join(', ')}`)
    process.exit(1)
  }
  console.log('seed-volume-fixtures: todos los objetivos de volumen alcanzados')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
