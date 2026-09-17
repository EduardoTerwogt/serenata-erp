// THROWAWAY -- EF-3 3E-1 diagnóstico (nunca merge). Hipótesis del coordinador:
// el mismo bug de Set-Cookie duplicado que rest-login.mjs/env-check.mjs ya
// tuvieron que resolver a mano (mergeCookies(), última wins por nombre) para
// GET /api/auth/csrf podría estar presente TAMBIÉN en el cookie de sesión
// real que emite POST /api/auth/callback/credentials -- y el cookie jar
// automático de k6 (a diferencia del merge manual de los scripts Node) podría
// no aplicar "el último Set-Cookie del mismo nombre gana" igual que un
// browser real. Un solo VU, una sola iteración -- diagnóstico puntual, no
// carga.
import http from 'k6/http'

const TARGET_URL = __ENV.TARGET_URL
const EMAIL = __ENV.PLAYWRIGHT_TEST_EMAIL
const PASSWORD = __ENV.PLAYWRIGHT_TEST_PASSWORD

export const options = { vus: 1, iterations: 1 }

export default function () {
  const csrfRes = http.get(`${TARGET_URL}/api/auth/csrf`)
  console.log(`DIAG csrf status=${csrfRes.status}`)
  console.log(`DIAG csrf res.cookies=${JSON.stringify(csrfRes.cookies)}`)
  console.log(`DIAG csrf res.headers[Set-Cookie]=${JSON.stringify(csrfRes.headers['Set-Cookie'])}`)
  const { csrfToken } = JSON.parse(csrfRes.body)

  const loginRes = http.post(
    `${TARGET_URL}/api/auth/callback/credentials`,
    { csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${TARGET_URL}/`, json: 'true' },
    { redirects: 0 }
  )
  console.log(`DIAG login status=${loginRes.status}`)
  console.log(`DIAG login res.cookies=${JSON.stringify(loginRes.cookies)}`)
  console.log(`DIAG login res.headers[Set-Cookie]=${JSON.stringify(loginRes.headers['Set-Cookie'])}`)

  const jar = http.cookieJar()
  const jarCookiesAfterLogin = jar.cookiesForURL(TARGET_URL)
  console.log(`DIAG jar after login=${JSON.stringify(jarCookiesAfterLogin)}`)

  const req1 = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  console.log(`DIAG req1 status=${req1.status} body=${(req1.body || '').slice(0, 200)}`)
  console.log(`DIAG req1 res.cookies=${JSON.stringify(req1.cookies)}`)
  console.log(`DIAG req1 res.headers[Set-Cookie]=${JSON.stringify(req1.headers['Set-Cookie'])}`)

  const jarAfterReq1 = jar.cookiesForURL(TARGET_URL)
  console.log(`DIAG jar after req1=${JSON.stringify(jarAfterReq1)}`)

  const req2 = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  console.log(`DIAG req2 status=${req2.status} body=${(req2.body || '').slice(0, 200)}`)

  const req3 = http.get(`${TARGET_URL}/api/cuentas-cobrar?search=&page=1&pageSize=50`)
  console.log(`DIAG req3 status=${req3.status} body=${(req3.body || '').slice(0, 200)}`)
}
