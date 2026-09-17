// F28 (docs/decisions/010-f28-diferir-race-cookie-nextauth.md): reproducción
// mínima y aislada de la race de rotación del cookie de sesión de
// next-auth. Sin fixtures propias -- GET /api/realtime/token solo exige
// requireAuthenticated(), sin sección específica, igual que la sonda que
// usa tests/e2e/live/staff-session-concurrent-rotation.spec.ts.
//
// Patrón documentado en docs/archive/ef-3-baseline-final.md (root cause de
// F28): N VUs concurrentes contra la MISMA cuenta -- cada VU loguea por su
// cuenta (su propio cookie jar de k6, mismo patrón que dashboard.js/
// session-version-cost.js) y golpea el endpoint en loop tight, sin
// think-time, para maximizar la chance real de que las rotaciones se
// solapen. `constant-vus` (no `ramping-vus`/`buildOptions()`) a propósito:
// las 5 VUs deben estar activas desde el primer segundo, no ir subiendo de
// a poco -- el hallazgo original se reprodujo con exactamente 5 sesiones
// concurrentes de la misma cuenta.
import http from 'k6/http'
import { check } from 'k6'
import { DEFAULT_THRESHOLDS, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')

export const options = __ENV.SMOKE === '1'
  ? { vus: 1, iterations: 1, thresholds: {} }
  : { vus: 5, duration: '2m', thresholds: DEFAULT_THRESHOLDS }

let loggedIn = false

export default function diagCookiesConcurrent() {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  const res = http.get(`${TARGET_URL}/api/realtime/token`)
  check(res, { 'GET /api/realtime/token: 200': (r) => r.status === 200 })
  // Sin sleep entre iteraciones a propósito -- un think-time reduciría la
  // chance de que las VUs se solapen genuinamente contra la misma cuenta.
}
