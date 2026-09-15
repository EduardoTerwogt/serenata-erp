// EF-3A 3A-5: helpers compartidos por los escenarios de k6.
//
// `ramping-vus` (concurrencia real, cada VU es un usuario simulado
// haciendo acción→sleep(think_time)→repite), nunca `ramping-arrival-rate`
// (esa mide iteraciones/segundo, no usuarios concurrentes -- confirmado
// contra docs/EF-3_ENGINEERING_HARDENING.md 3A-5 punto 1). El modo SMOKE
// no puede lograrse con flags de CLI (`--vus 1 --iterations 1` no pisa un
// `options.scenarios` ya declarado en el script) -- cada script construye
// sus opciones vía `buildOptions()`.
import http from 'k6/http'
import { check } from 'k6'

export function buildOptions(scenarioStages, thresholds) {
  if (__ENV.SMOKE === '1') {
    return { vus: 1, iterations: 1, thresholds: {} }
  }
  return {
    scenarios: { main: { executor: 'ramping-vus', stages: scenarioStages, gracefulRampDown: '30s' } },
    thresholds,
  }
}

// Umbrales generales del audit (evaluados como gate real recién en 3E-1 --
// aquí solo se declaran para que 3A-6 los reporte). Escenarios con su
// propio umbral especial (uploads.js) los extienden en vez de usar este.
export const DEFAULT_THRESHOLDS = {
  http_req_duration: ['p(95)<800', 'p(99)<1500'],
  http_req_failed: ['rate<0.01'],
}

export function requiredEnv(name) {
  const value = __ENV[name]
  if (!value) {
    throw new Error(`falta la variable de entorno --env ${name}=... (ver docs/EF-3_ENGINEERING_HARDENING.md 3A-5)`)
  }
  return value
}

// Login REST de staff -- mismo handshake de 2 pasos que
// scripts/loadtest/rest-login.mjs (GET /api/auth/csrf + POST
// /api/auth/callback/credentials), reescrito para el runtime de k6 (no
// corre Node, no puede importar ese script directo). El cookie jar por VU
// de k6 aplica los Set-Cookie automáticamente -- incluidos los 2
// duplicados que /api/auth/csrf devuelve para authjs.csrf-token (uno del
// middleware, otro de la ruta): un jar de cookies real se queda con el
// último por nombre, mismo criterio que mergeCookies() en el script Node,
// así que no hace falta fusionar nada a mano aquí.
export function loginStaff(targetUrl, email, password) {
  const csrfRes = http.get(`${targetUrl}/api/auth/csrf`)
  check(csrfRes, { 'csrf: status 200': (r) => r.status === 200 })
  const { csrfToken } = JSON.parse(csrfRes.body)

  const loginRes = http.post(
    `${targetUrl}/api/auth/callback/credentials`,
    { csrfToken, email, password, callbackUrl: `${targetUrl}/`, json: 'true' },
    { redirects: 0 }
  )
  check(loginRes, { 'login: status 200 o redirect': (r) => r.status === 200 || r.status === 302 })
}
