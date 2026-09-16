// EF-3A 3A-5: ~20 usuarios creando cotizaciones concurrentemente.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'
import { buildCotizacionPayload, buildOptions, DEFAULT_THRESHOLDS, fetchProveedorIds, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')
const RUN_ID = requiredEnv('RUN_ID')

const crearCotizacionMs = new Trend('crear_cotizacion_ms')

const STAGES = [
  { target: 2, duration: '30s' },
  { target: 20, duration: '11m30s' },
]

export const options = buildOptions(STAGES, DEFAULT_THRESHOLDS)

// setup() corre una sola vez en el proceso principal -- trae el pool real
// de proveedores de fixture (3A-2/3A-3) que cada VU usa como
// responsable_id. No hay forma de compartir un array creado en runtime
// entre VUs salvo el valor de retorno de setup() (SharedArray/open() solo
// leen archivos de disco preparados de antemano, no un id real que no
// existe hasta que corre esta misma función).
export function setup() {
  loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
  return { proveedorIds: fetchProveedorIds(TARGET_URL) }
}

let loggedIn = false

export default function crearCotizaciones(data) {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  const proveedorId = data.proveedorIds[(__VU + __ITER) % data.proveedorIds.length]
  const payload = buildCotizacionPayload(
    RUN_ID,
    `${__VU}-${__ITER}`,
    `LOADTEST-${RUN_ID}-Item-${__VU}-${__ITER}-1`,
    `Proyecto carga ${__ITER}`,
    proveedorId
  )

  const start = Date.now()
  const createRes = http.post(`${TARGET_URL}/api/cotizaciones`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  })
  crearCotizacionMs.add(Date.now() - start)
  check(createRes, { 'POST /api/cotizaciones: 201': (r) => r.status === 201 })

  if (createRes.status === 201) {
    const cotizacion = JSON.parse(createRes.body)
    const emitirRes = http.post(`${TARGET_URL}/api/cotizaciones/${cotizacion.id}/emitir`)
    check(emitirRes, { 'POST .../emitir: 200': (r) => r.status === 200 })
  }

  sleep(2 + Math.random() * 4)
}
