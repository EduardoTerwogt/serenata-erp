// EF-3A 3A-5: panel del dashboard ejecutivo -- solo lectura, sin cleanup
// propio. Think time largo (5-15s) porque simula lectura del panel, no
// navegación rápida.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'
import { buildOptions, DEFAULT_THRESHOLDS, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')

const dashboardMs = new Trend('dashboard_ms')

const STAGES = [
  { target: 2, duration: '30s' },
  { target: 20, duration: '11m30s' },
]

export const options = buildOptions(STAGES, DEFAULT_THRESHOLDS)

let loggedIn = false

export default function dashboard() {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  const start = Date.now()
  const resumenRes = http.get(`${TARGET_URL}/api/dashboard/resumen`)
  check(resumenRes, { 'GET /api/dashboard/resumen: 200': (r) => r.status === 200 })
  dashboardMs.add(Date.now() - start)

  sleep(5 + Math.random() * 10)
}
