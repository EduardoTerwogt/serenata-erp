// EF-3A 3A-5: aislado del resto, constant-vus sin ramp -- mide el costo
// por request de `session_version` sin ruido de los otros 7 escenarios
// corriendo a la vez.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { buildCotizacionPayload, fetchProveedorIds, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')
const RUN_ID = requiredEnv('RUN_ID')

export const options = __ENV.SMOKE === '1'
  ? { vus: 1, iterations: 1, thresholds: {} }
  : { vus: 5, duration: '5m', thresholds: {} }

// 1 sola cotización de fixture, reutilizada por las 5 VUs durante todo el
// escenario -- el objetivo es medir el costo por request, no ejercer
// concurrencia.
export function setup() {
  loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
  const proveedorIds = fetchProveedorIds(TARGET_URL)
  const payload = buildCotizacionPayload(
    RUN_ID,
    'SessionVersionCost',
    `LOADTEST-${RUN_ID}-Item-session-version-cost-1`,
    'Proyecto carga session-version-cost',
    proveedorIds[0]
  )
  const createRes = http.post(`${TARGET_URL}/api/cotizaciones`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  })
  check(createRes, { 'setup: POST /api/cotizaciones 201': (r) => r.status === 201 })
  const cotizacion = JSON.parse(createRes.body)
  return { id: cotizacion.id }
}

let loggedIn = false

export default function sessionVersionCost(data) {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }
  const res = http.get(`${TARGET_URL}/api/cotizaciones/${data.id}`)
  check(res, { 'GET /api/cotizaciones/[id]: 200': (r) => r.status === 200 })
  sleep(1)
}
