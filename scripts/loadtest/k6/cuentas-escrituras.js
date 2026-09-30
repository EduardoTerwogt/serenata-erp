// Frente 2 de Cuentas (docs/decisions/019): carga de ESCRITURAS de Cuentas.
// ~20 usuarios creando, emitiendo y aprobando cotizaciones a la vez. Aprobar
// genera cuentas por cobrar, por pagar y grupos de pago, y dispara los
// triggers que mantienen cuentas_conceptos_base: un refresco por proyecto al
// confirmar, con un advisory lock por proyecto. Mide cuánto cuesta aprobar
// (aprobar_cotizacion_ms) y comprueba que la lectura de Cuentas sigue
// respondiendo mientras otros escriben.
//
// Limpieza: bulk-cleanup.mjs por RUN_ID (borra cuentas, grupos, proyectos y
// cotizaciones de la corrida). Los pagos concurrentes quedan fuera: una
// cuenta con pagos no se puede borrar (reglas R1/D22) y cuentas.js ya excluye
// las rutas que agrupan cuentas reales del entorno.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'
import { buildCotizacionPayload, buildOptions, DEFAULT_THRESHOLDS, fetchProveedorIds, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')
const RUN_ID = requiredEnv('RUN_ID')

const aprobarCotizacionMs = new Trend('aprobar_cotizacion_ms')

const STAGES = [
  { target: 2, duration: '30s' },
  { target: 20, duration: '11m30s' },
]

// Aprobar es lo que paga los triggers: mismo presupuesto que el resto de la
// app, medido aparte para que un p95 alto de aprobar no quede diluido entre
// las peticiones baratas.
export const options = buildOptions(STAGES, {
  ...DEFAULT_THRESHOLDS,
  aprobar_cotizacion_ms: ['p(95)<800', 'p(99)<1500'],
})

export function setup() {
  loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
  return { proveedorIds: fetchProveedorIds(TARGET_URL) }
}

let loggedIn = false

export default function cuentasEscrituras(data) {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  const proveedorId = data.proveedorIds[(__VU + __ITER) % data.proveedorIds.length]
  const payload = buildCotizacionPayload(
    RUN_ID,
    `esc-${__VU}-${__ITER}`,
    `LOADTEST-${RUN_ID}-Item-esc-${__VU}-${__ITER}-1`,
    `Proyecto escrituras ${__ITER}`,
    proveedorId
  )

  const createRes = http.post(`${TARGET_URL}/api/cotizaciones`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  })
  check(createRes, { 'POST /api/cotizaciones: 201': (r) => r.status === 201 })

  if (createRes.status === 201) {
    const cotizacion = JSON.parse(createRes.body)
    const emitirRes = http.post(`${TARGET_URL}/api/cotizaciones/${cotizacion.id}/emitir`)
    check(emitirRes, { 'POST .../emitir: 200': (r) => r.status === 200 })

    if (emitirRes.status === 200) {
      const start = Date.now()
      const aprobarRes = http.post(`${TARGET_URL}/api/cotizaciones/${cotizacion.id}/aprobar`)
      aprobarCotizacionMs.add(Date.now() - start)
      check(aprobarRes, { 'POST .../aprobar: 200': (r) => r.status === 200 })
    }
  }

  // Quien lee Cuentas mientras otros aprueban: la lectura sale de la tabla que
  // los triggers acaban de refrescar.
  const resumenRes = http.get(`${TARGET_URL}/api/cuentas/resumen`)
  check(resumenRes, { 'GET /api/cuentas/resumen: 200': (r) => r.status === 200 })

  sleep(2 + Math.random() * 4)
}
