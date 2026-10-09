// #110 B0: lecturas globales de Cuentas con 5–10 usuarios simultáneos. Reemplaza al escenario anterior, que llamaba
// /api/cuentas-cobrar, /api/cuentas-pagar y /api/cuentas/por-proyecto (rutas que ya no existen).
//
// Cada iteración es una visita a /cuentas: lo que la pantalla pide al abrirse (periodo del mes, resumen del encabezado, avisos
// y opciones de los filtros) y, de vez en cuando, cambiar de mes o de vista. Solo lee; no crea datos ni necesita limpieza.
// Presupuesto: p95 < 800 ms POR ENDPOINT (umbrales por etiqueta `endpoint`) y menos de 1% de errores.
//
//   k6 run --env TARGET_URL=https://<host> --env PLAYWRIGHT_TEST_EMAIL=... --env PLAYWRIGHT_TEST_PASSWORD=... \
//          [--env VUS=10] [--env ANIO=2026] [--env DURACION=4m] scripts/loadtest/k6/cuentas.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { buildOptions, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')
const VUS = Number(__ENV.VUS || 10)
const ANIO = Number(__ENV.ANIO || new Date().getFullYear())
const DURACION = __ENV.DURACION || '4m'

const STAGES = [
  { target: Math.max(1, Math.floor(VUS / 2)), duration: '30s' },
  { target: VUS, duration: DURACION },
]

const ENDPOINTS = ['periodo_mes', 'periodo_anio', 'periodo_lista', 'resumen', 'avisos', 'opciones']
const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
}
for (const e of ENDPOINTS) THRESHOLDS[`http_req_duration{endpoint:${e}}`] = ['p(95)<800']

export const options = buildOptions(STAGES, THRESHOLDS)

let loggedIn = false

function leer(ruta, endpoint) {
  const res = http.get(`${TARGET_URL}${ruta}`, { tags: { endpoint } })
  check(res, { [`GET ${endpoint}: 200`]: (r) => r.status === 200 })
  return res
}

export default function cuentas() {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  // Abrir la pantalla: periodo del mes en curso + encabezado + avisos + opciones de filtros.
  const mes = 1 + Math.floor(Math.random() * 12)
  leer(`/api/cuentas/periodo?anio=${ANIO}&mes=${mes}&vista=proyectos&page_size=60`, 'periodo_mes')
  leer('/api/cuentas/resumen', 'resumen')
  leer('/api/cuentas/avisos', 'avisos')
  leer(`/api/cuentas/opciones?anio=${ANIO}`, 'opciones')

  // Navegar: a veces "Todo el año" o la vista de lista con solo pendientes.
  const r = Math.random()
  if (r < 0.3) leer(`/api/cuentas/periodo?anio=${ANIO}&mes=todo&vista=proyectos&page_size=60`, 'periodo_anio')
  else if (r < 0.5) leer(`/api/cuentas/periodo?anio=${ANIO}&mes=todo&estado=pendientes&vista=lista&page_size=60`, 'periodo_lista')

  sleep(2 + Math.random() * 3)
}
