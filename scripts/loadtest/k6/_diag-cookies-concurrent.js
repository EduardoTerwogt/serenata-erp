// THROWAWAY -- EF-3 3E-1 diagnóstico puntual (nunca merge). Distingue 2
// hipótesis del cookie jar de k6 bajo concurrencia real (varios VUs
// logueados con la MISMA cuenta de staff de fixture):
//   (a) jar compartido entre VUs (contra lo que dice el comentario de
//       _shared.js) -- un VU usa/recibe el valor de OTRO VU.
//   (b) race dentro del MISMO VU entre "la respuesta actualiza el jar" y
//       "la siguiente request ya salió con el valor viejo" -- en principio
//       no debería ser posible (cada VU de k6 es secuencial, una request a
//       la vez, sin async/batch aquí), pero se descarta con evidencia, no
//       por supuesto.
// Cada request loguea el prefijo del token ANTES de mandarla (lo que el
// jar tiene guardado, lo que realmente se envía) y DESPUÉS (lo que quedó
// tras un posible Set-Cookie de refresh -- NextAuth reemite el cookie de
// sesión en cada request autenticada, no solo en login). Si el "antes" de
// un VU coincide con el "después" que originalmente emitió un VU DISTINTO,
// eso es contaminación cruzada de jar, sin ambigüedad.
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

function sessionTokenPrefix(jar, url) {
  const cookies = jar.cookiesForURL(url)
  const values = cookies['__Secure-authjs.session-token'] || cookies['authjs.session-token'] || []
  return values.length > 0 ? values[0].slice(0, 28) : 'NONE'
}

export default function () {
  const jar = http.cookieJar()

  if (__ITER === 0) {
    const csrfRes = http.get(`${TARGET_URL}/api/auth/csrf`)
    const { csrfToken } = JSON.parse(csrfRes.body)
    const loginRes = http.post(
      `${TARGET_URL}/api/auth/callback/credentials`,
      { csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${TARGET_URL}/`, json: 'true' },
      { redirects: 0 }
    )
    console.log(`XVU vu=${__VU} LOGIN status=${loginRes.status} tokenAfter=${sessionTokenPrefix(jar, TARGET_URL)}`)
  }

  const before = sessionTokenPrefix(jar, TARGET_URL)
  const res = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  const after = sessionTokenPrefix(jar, TARGET_URL)
  const gotSetCookie = !!(res.headers && res.headers['Set-Cookie'])
  console.log(`XVU vu=${__VU} iter=${__ITER} before=${before} status=${res.status} setCookie=${gotSetCookie} after=${after}`)

  sleep(0.3)
}
