// EF-3A 3A-5: 25→50 proveedores subiendo facturas reales -- headers de
// override de Drive de 3A-4 (nunca el nombre `loadtest-${runId}`, siempre
// el ID real de la carpeta que create-drive-run-folder.mjs ya creó).
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { buildCotizacionPayload, buildOptions, DEFAULT_THRESHOLDS, fetchProveedorIds, loginStaff, requiredEnv } from './_shared.js'

const TARGET_URL = requiredEnv('TARGET_URL')
const STAFF_EMAIL = requiredEnv('PLAYWRIGHT_TEST_EMAIL')
const STAFF_PASSWORD = requiredEnv('PLAYWRIGHT_TEST_PASSWORD')
const RUN_ID = requiredEnv('RUN_ID')
const LOADTEST_DRIVE_FOLDER_ID = requiredEnv('LOADTEST_DRIVE_FOLDER_ID')
// .trim(): el secreto real trae a veces un LINE SEPARATOR (U+2028) colgando
// de copiar/pegar en GitHub Secrets -- mismo fix ya aplicado en el guard
// del propio servidor y en los scripts Node de 3A-1/3A-4.
const LOADTEST_SECRET = requiredEnv('LOADTEST_ENV_SECRET').trim()

const uploadMs = new Trend('upload_ms')
const uploadErrorRate = new Rate('upload_error_rate')

const STAGES = [
  { target: 4, duration: '30s' },
  { target: 38, duration: '11m30s' },
]

export const options = buildOptions(STAGES, {
  ...DEFAULT_THRESHOLDS,
  http_req_duration: ['p(95)<5000', 'p(99)<8000'],
  upload_error_rate: ['rate<0.02'],
})

// Archivos fijos del repo -- nunca generados on-the-fly, para que el
// tamaño/contenido sea determinístico entre corridas. open() se resuelve
// relativo a este script, no al cwd del proceso k6.
const facturaXml = open('../fixtures/factura-ejemplo.xml')
const facturaPdf = open('../fixtures/factura-ejemplo.pdf', 'b')

// setup() corre siempre completo sin importar options.scenarios/SMOKE --
// sin este guard explícito, una corrida de humo (pensada para 1 sola
// iteración) igual crearía+emitiría+aprobaría 50 cotizaciones antes de esa
// única iteración.
const FIXTURE_COUNT = __ENV.SMOKE === '1' ? 1 : 50

export function setup() {
  loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
  const proveedorIds = fetchProveedorIds(TARGET_URL)
  const cuentaPagarIds = []

  for (let i = 1; i <= FIXTURE_COUNT; i++) {
    const itemDescripcion = `LOADTEST-${RUN_ID}-Item-uploads-${i}`
    const payload = buildCotizacionPayload(
      RUN_ID, `Uploads-${i}`, itemDescripcion, `Proyecto carga uploads ${i}`, proveedorIds[i % proveedorIds.length]
    )
    const createRes = http.post(`${TARGET_URL}/api/cotizaciones`, JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    })
    if (createRes.status !== 201) {
      throw new Error(`uploads.js setup: POST /api/cotizaciones falló (status ${createRes.status}): ${createRes.body}`)
    }
    const cotizacion = JSON.parse(createRes.body)

    const emitirRes = http.post(`${TARGET_URL}/api/cotizaciones/${cotizacion.id}/emitir`)
    if (emitirRes.status !== 200) {
      throw new Error(`uploads.js setup: POST .../emitir falló (status ${emitirRes.status})`)
    }

    const aprobarRes = http.post(`${TARGET_URL}/api/cotizaciones/${cotizacion.id}/aprobar`)
    if (aprobarRes.status !== 200) {
      throw new Error(`uploads.js setup: POST .../aprobar falló (status ${aprobarRes.status})`)
    }

    // buscar_cuentas_pagar indexa item_descripcion -- confirmado en
    // db/migrations/20260914_fix_buscar_cuentas_pagar_proyecto_nombre.sql.
    // La respuesta de .../aprobar no trae el id de cuentas_pagar directo,
    // así que se busca por el mismo prefijo único que ya taggea el ítem.
    const cuentaRes = http.get(`${TARGET_URL}/api/cuentas-pagar?search=${encodeURIComponent(itemDescripcion)}&page=1&pageSize=5`)
    if (cuentaRes.status !== 200) {
      throw new Error(`uploads.js setup: GET /api/cuentas-pagar falló (status ${cuentaRes.status})`)
    }
    const { rows } = JSON.parse(cuentaRes.body)
    if (!rows || rows.length === 0) {
      throw new Error(`uploads.js setup: no se encontró cuenta_pagar para ${itemDescripcion}`)
    }
    cuentaPagarIds.push(rows[0].id)
  }

  return { cuentaPagarIds }
}

let loggedIn = false

export default function uploads(data) {
  if (!loggedIn) {
    loginStaff(TARGET_URL, STAFF_EMAIL, STAFF_PASSWORD)
    loggedIn = true
  }

  const cuentaPagarId = data.cuentaPagarIds[__VU % data.cuentaPagarIds.length]
  const start = Date.now()
  const res = http.post(
    `${TARGET_URL}/api/cuentas-pagar/${cuentaPagarId}/subir-factura`,
    {
      factura_proveedor_xml: http.file(facturaXml, 'factura-ejemplo.xml', 'text/xml'),
      factura_proveedor_pdf: http.file(facturaPdf, 'factura-ejemplo.pdf', 'application/pdf'),
    },
    {
      headers: {
        'x-loadtest-secret': LOADTEST_SECRET,
        'x-loadtest-drive-folder-id': LOADTEST_DRIVE_FOLDER_ID,
      },
    }
  )
  uploadMs.add(Date.now() - start)
  const ok = res.status === 200
  check(res, { 'POST subir-factura: 200': () => ok })
  uploadErrorRate.add(!ok)

  sleep(5 + Math.random() * 5)
}
