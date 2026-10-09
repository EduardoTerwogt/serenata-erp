// #110 B3: lecturas de Cuentas con usuarios simultáneos, con el comportamiento REAL de la pantalla (reemplaza al escenario anterior,
// que llamaba /api/cuentas-cobrar, /api/cuentas-pagar y /api/cuentas/por-proyecto, rutas que ya no existen).
//
// Cada iteración es una acción del usuario, no una visita completa: la primera abre la pantalla (periodo, resumen y opciones del
// año); las demás navegan (periodo) y de vez en cuando recargan el resumen (tras registrar algo) o abren el panel de avisos.
// `opciones` se pide una vez por año y sesión; `avisos` solo con el panel abierto (useCuentasDatos.ts / CuentasApp.tsx).
//
// PUERTA (decisión del usuario, 2026-10-09): 5 usuarios simultáneos (VUS=5, el default), p95 < 800 ms POR ENDPOINT y < 1% de errores.
// Con VUS=10 el escenario es solo un DATO (se espera ~1-1.5 s en Micro): sus umbrales fallarán y eso no reprueba la puerta; sirve
// de aviso para subir el plan de Supabase. Ver docs/PLAN.md → «Resultados de B3».
//
//   k6 run --env TARGET_URL=https://<host> --env PLAYWRIGHT_TEST_EMAIL=... --env PLAYWRIGHT_TEST_PASSWORD=... \
//          [--env VUS=5] [--env ANIO=2026] [--env DURACION=4m] scripts/loadtest/k6/cuentas.js
import http from 'k6/http'
import { check, sleep } from 'k6'
import { buildOptions, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')
const VUS = Number(__ENV.VUS || 5)
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

  const mes = 1 + Math.floor(Math.random() * 12)
  const periodo = `/api/cuentas/periodo?anio=${ANIO}&mes=${mes}&vista=proyectos&page_size=60`

  if (__ITER === 0) {
    // Abrir la pantalla: periodo del mes + encabezado + opciones de filtros (estas dos, una vez por sesión).
    leer(periodo, 'periodo_mes')
    leer('/api/cuentas/resumen', 'resumen')
    leer(`/api/cuentas/opciones?anio=${ANIO}`, 'opciones')
  } else {
    // Navegar: cambiar de mes, "Todo el año" o la vista de lista con solo pendientes.
    const r = Math.random()
    if (r < 0.3) leer(`/api/cuentas/periodo?anio=${ANIO}&mes=todo&vista=proyectos&page_size=60`, 'periodo_anio')
    else if (r < 0.45) leer(`/api/cuentas/periodo?anio=${ANIO}&mes=todo&estado=pendientes&vista=lista&page_size=60`, 'periodo_lista')
    else leer(periodo, 'periodo_mes')
    // Tras registrar algo, la UI recarga el resumen; el panel de avisos se abre de vez en cuando.
    if (Math.random() < 0.15) leer('/api/cuentas/resumen', 'resumen')
    if (Math.random() < 0.1) leer('/api/cuentas/avisos', 'avisos')
  }

  sleep(5 + Math.random() * 7)
}
