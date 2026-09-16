// EF-3A 3A-5: 100→150 proveedores navegando el Portal, con sesión
// bypaseada (3A-2) -- nunca por /api/portal/login, que tiene rate limit
// real (20/900s por IP, 5/900s por email) incompatible con esta escala.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'
import { SharedArray } from 'k6/data'
import { buildOptions, DEFAULT_THRESHOLDS, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')

const portal429Rate = new Rate('portal_429_rate')

const STAGES = [
  { target: 15, duration: '30s' },
  { target: 150, duration: '11m30s' },
]

export const options = buildOptions(STAGES, DEFAULT_THRESHOLDS)

// Cookies de sesión del Portal ya firmadas (3A-2, prepare-portal-fixtures.mjs)
// -- archivo preparado de antemano en disco, por eso (y solo por eso) usa
// SharedArray/open() en vez de setup(): esas 2 APIs solo leen archivos
// listos antes de que arranque cualquier VU, nunca datos creados en
// runtime por un POST HTTP (para eso está setup(), usado en los demás
// escenarios que sí crean datos).
const portalSessions = new SharedArray('portalSessions', () => {
  const raw = JSON.parse(open(requiredEnv('PORTAL_FIXTURES_FILE')))
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('portal.js: el archivo de fixtures de Portal está vacío -- correr prepare-portal-fixtures.mjs primero')
  }
  return raw
})

export default function portal() {
  const session = portalSessions[__VU % portalSessions.length]
  const headers = { Cookie: `portal_session=${session.cookieValue}` }

  const cuentasRes = http.get(`${TARGET_URL}/api/portal/cuentas`, { headers })
  check(cuentasRes, { 'GET /api/portal/cuentas: 200': (r) => r.status === 200 })
  portal429Rate.add(cuentasRes.status === 429)

  const documentosRes = http.get(`${TARGET_URL}/api/portal/documentos`, { headers })
  check(documentosRes, { 'GET /api/portal/documentos: 200': (r) => r.status === 200 })
  portal429Rate.add(documentosRes.status === 429)

  const perfilRes = http.get(`${TARGET_URL}/api/portal/perfil`, { headers })
  check(perfilRes, { 'GET /api/portal/perfil: 200': (r) => r.status === 200 })
  portal429Rate.add(perfilRes.status === 429)

  sleep(3 + Math.random() * 5)
}
