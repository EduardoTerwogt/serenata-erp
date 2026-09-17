// THROWAWAY -- EF-3 3E-1 diagnóstico puntual (nunca merge). k6 no expone un
// constructor para crear un jar nuevo/separado (http.cookieJar() siempre
// devuelve el jar implícito del VU actual, ya per-VU por diseño -- no hay
// una config "más explícita" que probar) -- docs.k6.io bloqueado por policy
// de egress de este sandbox, así que esto se apoya en la API ya confirmada
// empíricamente en las corridas anteriores (cookiesForURL() funciona).
//
// Test más discriminante disponible: en vez de confiar en que el jar
// automático de k6 procese correctamente el Set-Cookie de sesión que
// NextAuth reemite en CADA request autenticada (rolling session, ya
// confirmado normal -- ver proxy.ts envuelto en auth()), esta versión
// parsea el Set-Cookie crudo a mano después de cada respuesta y fuerza el
// valor correcto al jar vía jar.set() -- mismo principio que
// mergeCookies() en rest-login.mjs/env-check.mjs (último gana por
// nombre), pero escribiendo al jar de k6 en vez de a un Cookie header
// manual (para no tener 2 mecanismos de cookies compitiendo en la misma
// request). Si esto arregla el 401 sostenido bajo la misma concurrencia
// (5 VUs) que rompió con el jar 100% automático, confirma que el
// mecanismo del jar automático de k6 (compartido o no) es la causa real,
// y de paso valida el patrón exacto del fix.
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

function forceLastSetCookieIntoJar(jar, url, res) {
  const raw = res.headers && res.headers['Set-Cookie']
  if (!raw) return { count: 0, error: null }
  // k6 combina varios Set-Cookie del mismo response en un solo string
  // separados por ", " -- separa por ", " seguido de un nombre=valor
  // (heurística razonable: un valor de cookie real no debería contener esa
  // secuencia exacta).
  const parts = raw.split(/, (?=[^;]+=)/)
  let count = 0
  for (const part of parts) {
    const nameValue = part.split(';')[0]
    const eq = nameValue.indexOf('=')
    if (eq === -1) continue
    const name = nameValue.trim().slice(0, eq)
    const value = nameValue.slice(eq + 1).trim()
    try {
      // secure:true explícito -- RFC 6265bis exige el atributo Secure para
      // cookies con prefijo __Secure-/__Host- (los 2 que emite esta app);
      // omitirlo puede hacer que el jar (basado en net/http/cookiejar de
      // Go) rechace o no adjunte el cookie en requests siguientes,
      // independientemente de que el valor extraído sea el correcto --
      // primer intento de este diagnóstico lo omitió, resultado no
      // concluyente.
      jar.set(url, name, value, { path: '/', secure: true })
      count++
    } catch (e) {
      console.log(`FORCEJAR vu=${__VU} jar.set ERROR name=${name} msg=${e.message}`)
      return { count, error: e.message }
    }
  }
  return { count, error: null }
}

export default function () {
  const jar = http.cookieJar()

  if (__ITER === 0) {
    const csrfRes = http.get(`${TARGET_URL}/api/auth/csrf`)
    const r1 = forceLastSetCookieIntoJar(jar, TARGET_URL, csrfRes)
    const { csrfToken } = JSON.parse(csrfRes.body)

    const loginRes = http.post(
      `${TARGET_URL}/api/auth/callback/credentials`,
      { csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${TARGET_URL}/`, json: 'true' },
      { redirects: 0 }
    )
    const r2 = forceLastSetCookieIntoJar(jar, TARGET_URL, loginRes)
    console.log(`FORCEJAR vu=${__VU} LOGIN status=${loginRes.status} csrfSet=${r1.count} loginSet=${r2.count}`)
  }

  const res = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  const r3 = forceLastSetCookieIntoJar(jar, TARGET_URL, res)
  console.log(`FORCEJAR vu=${__VU} iter=${__ITER} status=${res.status} setCount=${r3.count}`)

  sleep(0.3)
}
