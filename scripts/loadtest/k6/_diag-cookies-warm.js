// THROWAWAY -- EF-3 3E-1 diagnóstico puntual (nunca merge). Hipótesis del
// coordinador: los 5 VUs de _diag-cookies-concurrent.js pasan de éxito a
// 401 TODOS en el mismo instante (no escalonado por VU) -- eso apunta a
// un estado GLOBAL, único, del lado del servidor (no algo por-VU/por-jar,
// ya descartado). Candidato: race de "thundering herd" en la derivación
// perezosa (memoizada a nivel de módulo, en el primer uso) de la clave de
// cifrado/firma del JWT a partir de AUTH_SECRET -- si varias requests
// concurrentes disparan esa derivación en un proceso RECIÉN arrancado
// (exactamente lo que es tanto `next start` recién lanzado como una
// invocación serverless en cold start), la que "gana" la memoización deja
// inválido lo firmado/cifrado por instancias perdedoras de la derivación
// unos milisegundos antes.
//
// setup() de k6 corre UNA sola vez, secuencial, garantizado ANTES de que
// arranque cualquier VU del escenario principal -- se usa aquí para forzar
// un login+request real (y por lo tanto cualquier inicialización perezosa
// del lado del servidor) a completarse y asentarse ANTES de lanzar los 5
// VUs concurrentes contra el MISMO proceso ya corriendo (sin reiniciar
// nada entre medio). Si el bloque de 5 VUs pasa limpio estando el proceso
// ya "caliente", confirma que es una carrera de cold-start, no un bug de
// concurrencia sostenido.
import http from 'k6/http'
import { sleep } from 'k6'

const TARGET_URL = __ENV.TARGET_URL
const EMAIL = __ENV.PLAYWRIGHT_TEST_EMAIL
const PASSWORD = __ENV.PLAYWRIGHT_TEST_PASSWORD

export const options = {
  scenarios: {
    diag: { executor: 'per-vu-iterations', vus: 5, iterations: 8, maxDuration: '2m' },
  },
}

function loginAndOneRequest(tag) {
  const csrfRes = http.get(`${TARGET_URL}/api/auth/csrf`)
  const { csrfToken } = JSON.parse(csrfRes.body)
  const loginRes = http.post(
    `${TARGET_URL}/api/auth/callback/credentials`,
    { csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${TARGET_URL}/`, json: 'true' },
    { redirects: 0 }
  )
  const res = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  console.log(`WARMUP ${tag} login=${loginRes.status} req1=${res.status}`)
}

export function setup() {
  // Warmup secuencial real -- 3 round-trips completos (csrf, login,
  // request autenticada) para forzar cualquier inicialización perezosa del
  // lado del servidor antes de que arranque la concurrencia real.
  loginAndOneRequest('A')
  sleep(0.2)
  loginAndOneRequest('B')
}

export default function () {
  if (__ITER === 0) {
    const csrfRes = http.get(`${TARGET_URL}/api/auth/csrf`)
    const { csrfToken } = JSON.parse(csrfRes.body)
    const loginRes = http.post(
      `${TARGET_URL}/api/auth/callback/credentials`,
      { csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${TARGET_URL}/`, json: 'true' },
      { redirects: 0 }
    )
    console.log(`WARM vu=${__VU} LOGIN status=${loginRes.status}`)
  }

  const res = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  console.log(`WARM vu=${__VU} iter=${__ITER} status=${res.status}`)

  sleep(0.3)
}
