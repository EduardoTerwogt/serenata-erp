// EF-3A 3A-5: helpers compartidos por los escenarios de k6.
//
// `ramping-vus` (concurrencia real, cada VU es un usuario simulado
// haciendo acción→sleep(think_time)→repite), nunca `ramping-arrival-rate`
// (esa mide iteraciones/segundo, no usuarios concurrentes -- confirmado
// contra docs/archive/ef-3-engineering-hardening.md 3A-5 punto 1). El modo SMOKE
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
    throw new Error(`falta la variable de entorno --env ${name}=... (ver docs/archive/ef-3-engineering-hardening.md 3A-5)`)
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

// GET /api/proveedores devuelve el catálogo completo (sin paginar) -- pool
// real de responsable_id para los escenarios que crean cotizaciones
// (3A-2/3A-3 ya sembraron fixtures reales). Asume que el caller ya inició
// sesión de staff en su mismo scope (setup() o la VU actual) -- setup()
// tiene su propio cookie jar, separado del de cada VU, así que este
// helper nunca hace login por su cuenta.
export function fetchProveedorIds(targetUrl) {
  const res = http.get(`${targetUrl}/api/proveedores`)
  check(res, { 'proveedores: status 200': (r) => r.status === 200 })
  const proveedores = JSON.parse(res.body)
  if (!Array.isArray(proveedores) || proveedores.length === 0) {
    throw new Error('fetchProveedorIds: sin proveedores de fixture -- correr 3A-2/3A-3 primero')
  }
  return proveedores.map((p) => p.id)
}

export function fechaEntregaEn15Dias() {
  const d = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

// Payload real de creación de cotización, compartido por
// crear-cotizaciones.js/editar-concurrente.js/uploads.js/
// session-version-cost.js -- x_pagar>0 siempre: sin eso approve_cotizacion
// no genera ninguna fila en cuentas_pagar (confirmado en
// db/migrations/20260408_approve_cotizacion_rpc.sql:112), y varios de esos
// escenarios dependen de que sí existan cuentas por pagar reales.
export function buildCotizacionPayload(runId, clienteSuffix, itemDescripcion, proyecto, responsableId) {
  return {
    cliente: `LOADTEST-${runId}-Cliente-${clienteSuffix}`,
    proyecto,
    fecha_entrega: fechaEntregaEn15Dias(),
    items: [{
      descripcion: itemDescripcion,
      categoria: 'Producción',
      cantidad: 1,
      precio_unitario: 1000,
      x_pagar: 700,
      responsable_id: responsableId,
    }],
  }
}

// wss://<ref>.supabase.co/realtime/v1/websocket?apikey=...&vsn=1.0.0 --
// misma derivación que supabase-js hace internamente a partir de la URL
// http(s) del proyecto (createClient() nunca fija una URL de Realtime
// distinta en este repo, confirmado en lib/supabase-browser.ts).
export function buildRealtimeWsUrl(supabaseUrl, anonKey) {
  const wsBase = supabaseUrl.replace(/^http/, 'ws')
  return `${wsBase}/realtime/v1/websocket?apikey=${anonKey}&vsn=1.0.0`
}
