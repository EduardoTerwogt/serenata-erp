// EF-3A 3A-5: listados de cuentas por cobrar/pagar -- solo lectura, usa
// los datos ya sembrados por 3A-3, sin cleanup propio. Deliberadamente NO
// incluye POST /api/cuentas-pagar/generar-orden-pago: esa ruta agrupa
// TODAS las cuentas pendientes reales del entorno (no solo las del
// fixture) y borrar la orden resultante en el cleanup arriesgaría destruir
// historial ajeno -- decisión ya documentada en 3A-4.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { buildOptions, DEFAULT_THRESHOLDS, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')

const STAGES = [
  { target: 2, duration: '30s' },
  { target: 15, duration: '11m30s' },
]

export const options = buildOptions(STAGES, DEFAULT_THRESHOLDS)

let loggedIn = false

export default function cuentas() {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  const cobrarRes = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  check(cobrarRes, { 'GET /api/cuentas-cobrar: 200': (r) => r.status === 200 })

  const pagarRes = http.get(`${TARGET_URL}/api/cuentas-pagar?search=&page=1&pageSize=50`)
  check(pagarRes, { 'GET /api/cuentas-pagar: 200': (r) => r.status === 200 })

  const porProyectoRes = http.get(`${TARGET_URL}/api/cuentas/por-proyecto`)
  check(porProyectoRes, { 'GET /api/cuentas/por-proyecto: 200': (r) => r.status === 200 })

  sleep(2 + Math.random() * 2)
}
