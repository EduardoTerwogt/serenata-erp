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

  // DIAG (EF-3 3E-1, diagnóstico de F27b -- throwaway, nunca merge): status
  // real + snippet de body en cada falla, al log del job (foreground).
  const cobrarRes = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  const cobrarOk = check(cobrarRes, { 'GET /api/cuentas-cobrar: 200': (r) => r.status === 200 })
  if (!cobrarOk) console.log(`DIAG-FAIL cuentas-cobrar vu=${__VU} iter=${__ITER} status=${cobrarRes.status} body=${(cobrarRes.body || '').slice(0, 150)}`)

  const pagarRes = http.get(`${TARGET_URL}/api/cuentas-pagar?search=&page=1&pageSize=50`)
  const pagarOk = check(pagarRes, { 'GET /api/cuentas-pagar: 200': (r) => r.status === 200 })
  if (!pagarOk) console.log(`DIAG-FAIL cuentas-pagar vu=${__VU} iter=${__ITER} status=${pagarRes.status} body=${(pagarRes.body || '').slice(0, 150)}`)

  const porProyectoRes = http.get(`${TARGET_URL}/api/cuentas/por-proyecto`)
  const porProyectoOk = check(porProyectoRes, { 'GET /api/cuentas/por-proyecto: 200': (r) => r.status === 200 })
  if (!porProyectoOk) console.log(`DIAG-FAIL por-proyecto vu=${__VU} iter=${__ITER} status=${porProyectoRes.status} body=${(porProyectoRes.body || '').slice(0, 150)}`)

  sleep(2 + Math.random() * 2)
}
