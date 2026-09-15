// EF-3A 3A-5: navegación del tablero Kanban de proyectos -- solo lectura,
// nunca escribe, así que no necesita taggeo por runId ni cleanup propio.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'
import { buildOptions, DEFAULT_THRESHOLDS, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')

const proyectosListadoMs = new Trend('proyectos_listado_ms')

const STAGES = [
  { target: 3, duration: '30s' },
  { target: 30, duration: '11m30s' },
]

export const options = buildOptions(STAGES, DEFAULT_THRESHOLDS)

let loggedIn = false

export default function navegacionProyectos() {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  const start = Date.now()

  const proyectosRes = http.get(`${TARGET_URL}/api/proyectos`)
  check(proyectosRes, { 'GET /api/proyectos: 200': (r) => r.status === 200 })

  const tareasRes = http.get(`${TARGET_URL}/api/proyectos/tareas`)
  check(tareasRes, { 'GET /api/proyectos/tareas: 200': (r) => r.status === 200 })

  proyectosListadoMs.add(Date.now() - start)

  sleep(2 + Math.random() * 3)
}
