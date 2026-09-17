// EF-3A 3A-5: 10 VUs editando la MISMA celda de la MISMA cotización
// concurrentemente + 1 VU observadora midiendo la propagación real de
// Realtime. Protocolo de autorización (2 pasos) y evento verificados
// contra el código real -- ver docs/archive/ef-3-engineering-hardening.md 3A-5.
import http from 'k6/http'
import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { buildCotizacionPayload, buildRealtimeWsUrl, DEFAULT_THRESHOLDS, fetchProveedorIds, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')
const RUN_ID = requiredEnv('RUN_ID')
const SUPABASE_URL = requiredEnv('TEST_SUPABASE_URL')
const SUPABASE_ANON_KEY = requiredEnv('TEST_SUPABASE_ANON_KEY')

const conflict409Rate = new Rate('conflict_409_rate')
const realtimePropagationMs = new Trend('realtime_propagation_ms')

// 30s ramp-up + 11m30s meseta = 12 min, igual que los demás escenarios --
// el escenario observador dura lo mismo, para cubrir toda la ventana de
// edición con la misma conexión.
const EDIT_STAGES = [
  { target: 10, duration: '30s' },
  { target: 10, duration: '11m30s' },
]
const TOTAL_DURATION_SECONDS = 30 + 11 * 60 + 30

export const options = __ENV.SMOKE === '1'
  ? { vus: 1, iterations: 1, thresholds: {} }
  : {
      scenarios: {
        edicion: { executor: 'ramping-vus', exec: 'edicion', stages: EDIT_STAGES, gracefulRampDown: '30s' },
        observador: { executor: 'constant-vus', exec: 'observador', vus: 1, duration: `${TOTAL_DURATION_SECONDS}s` },
      },
      thresholds: { ...DEFAULT_THRESHOLDS, realtime_propagation_ms: ['p(95)<2000', 'p(99)<8000'] },
    }

// setup() crea la ÚNICA cotización que las 10 VUs de edición comparten --
// nunca SharedArray/open() (esas 2 APIs solo leen archivos de disco
// preparados de antemano, no un id generado en runtime por un POST HTTP),
// y una "VU semilla" tampoco puede publicar nada a las demás: cada VU de
// k6 es su propio runtime aislado (goja), sin memoria compartida entre
// ellas. El valor de retorno de setup() es lo único que k6 garantiza pasar
// a cada VU. Ya es SMOKE-seguro por construcción -- crea exactamente 1
// cotización sin importar SMOKE/VUs.
export function setup() {
  loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
  const proveedorIds = fetchProveedorIds(TARGET_URL)
  const payload = buildCotizacionPayload(
    RUN_ID,
    'Concurrente',
    `LOADTEST-${RUN_ID}-Item-concurrente-1`,
    'Proyecto carga concurrente',
    proveedorIds[0]
  )
  const createRes = http.post(`${TARGET_URL}/api/cotizaciones`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  })
  check(createRes, { 'setup: POST /api/cotizaciones 201': (r) => r.status === 201 })
  const cotizacion = JSON.parse(createRes.body)
  return { id: cotizacion.id, itemId: cotizacion.items[0].id }
}

let loggedInEdicion = false

export function edicion(data) {
  if (!loggedInEdicion) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedInEdicion = true
  }

  // El timestamp de envío va codificado en el propio mutation_id -- es la
  // única forma de correlacionar con el broadcast que recibe la VU
  // observadora sin memoria compartida entre VUs.
  const mutationId = `edit-${__VU}-${__ITER}-${Date.now()}`
  const patchRes = http.patch(
    `${TARGET_URL}/api/cotizaciones/${data.id}/items/${data.itemId}`,
    JSON.stringify({ descripcion: `LOADTEST-${RUN_ID}-Concurrente-edit-${__VU}-${__ITER}`, mutation_id: mutationId }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  check(patchRes, { 'PATCH item: 200 o 409 (nunca 500)': (r) => r.status === 200 || r.status === 409 })
  conflict409Rate.add(patchRes.status === 409)

  sleep(1 + Math.random() * 2)
}

// Escenario observador de 1 VU -- abre 1 sola conexión WebSocket real al
// canal privado y la mantiene viva toda la corrida (nunca "compartida
// entre las 10 VUs de edición": cada VU de k6 es un runtime aislado, un
// WebSocket abierto en una VU no es visible desde otra).
export function observador(data) {
  loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
  const tokenRes = http.get(`${TARGET_URL}/api/realtime/token`)
  check(tokenRes, { 'GET /api/realtime/token: 200': (r) => r.status === 200 })
  const { token } = JSON.parse(tokenRes.body)

  const wsUrl = buildRealtimeWsUrl(SUPABASE_URL, SUPABASE_ANON_KEY)
  const res = ws.connect(wsUrl, {}, function (socket) {
    socket.on('open', () => {
      socket.send(JSON.stringify({
        topic: `realtime:cotizacion:${data.id}`,
        event: 'phx_join',
        payload: { config: { private: true }, access_token: token },
        ref: '1',
      }))
    })

    socket.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        return
      }
      if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'item_confirmed') {
        const inner = msg.payload.payload || {}
        const mutationId = inner.mutation_id
        if (typeof mutationId === 'string') {
          const sentAt = Number(mutationId.split('-').pop())
          if (Number.isFinite(sentAt)) {
            realtimePropagationMs.add(Date.now() - sentAt)
          }
        }
      }
    })

    // Heartbeat propio del cliente cada 15s -- Phoenix Channels cierra la
    // conexión si no recibe señales de vida, y sin esto el canal se caería
    // a mitad de los 12 minutos de la meseta.
    socket.setInterval(() => {
      socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }))
    }, 15000)

    socket.setTimeout(() => {
      socket.close()
    }, TOTAL_DURATION_SECONDS * 1000)
  })

  check(res, { 'ws: conexión abierta (101)': (r) => r && r.status === 101 })
}

export default edicion
