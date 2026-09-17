import { test, expect, BrowserContext, Page } from '@playwright/test'
import { login } from '../utils/auth'
import { liveEnabled } from '../utils/live-helpers'
import { cleanupLiveUser, ensureLiveUser } from '../utils/live-users'

/**
 * F28 (docs/decisions/010-f28-diferir-race-cookie-nextauth.md): reproduce la
 * race de rotación del cookie de sesión bajo requests genuinamente
 * concurrentes contra la misma sesión. Antes del fix, `auth()` usado como
 * middleware (`proxy.ts`) reemitía el cookie de sesión (Set-Cookie) en cada
 * invocación -- dos rotaciones concurrentes podían pisarse y dejar a un
 * cliente con el cookie superado, deslogueado (401) hasta el próximo login.
 * Reproducido en el gate de carga de EF-3 con tan solo 5 sesiones
 * concurrentes de la misma cuenta.
 *
 * Requiere el bypass de E2E apagado -- con `e2e-bypass` activo no hay cookie
 * real de NextAuth ni rotación que reproducir (`shouldBypassForE2E` en
 * `lib/proxy-handler.ts` corta el flujo antes de llegar a `getEdgeSessionToken`).
 *
 * `GET /api/realtime/token` como sonda: mismo endpoint barato que usa
 * `staff-session-revocation.spec.ts`, solo exige `requireAuthenticated()`,
 * sin reglas de sección de por medio.
 */

const PREFIJO = 'E2E-LIVE-CONCURRENT-ROTATION-'
const TARGET_EMAIL = `${PREFIJO}user@serenata.test`.toLowerCase()
const TARGET_PASSWORD = 'ConcurrentRotation-live-2026'
const TARGET_NAME = 'Concurrent Rotation User'
const TARGET_SECTIONS = ['dashboard']

const CONCURRENT_REQUESTS = 15

async function loginTarget(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await login(page, '/dashboard', { email: TARGET_EMAIL, password: TARGET_PASSWORD })
  return page
}

test.describe('live: race de rotación del cookie de sesión (F28)', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')

  let contextTarget: BrowserContext

  test.beforeAll(async () => {
    await ensureLiveUser({ email: TARGET_EMAIL, password: TARGET_PASSWORD, name: TARGET_NAME, sections: TARGET_SECTIONS })
  })

  test.afterAll(async () => {
    await contextTarget?.close()
    await cleanupLiveUser(TARGET_EMAIL).catch((e) => console.error('[live concurrent-rotation] cleanup:', e))
  })

  test(`${CONCURRENT_REQUESTS} requests genuinamente concurrentes contra la misma sesión -> ninguna desloguea a las demás`, async ({ browser }) => {
    contextTarget = await browser.newContext()
    const page = await loginTarget(contextTarget)

    // `page.request` comparte el cookie jar del browser context -- las N
    // requests salen con exactamente el mismo cookie de sesión, disparadas
    // en paralelo (sin await intermedio) para maximizar la chance real de
    // que dos rotaciones se solapen en el servidor.
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, () => page.request.get('/api/realtime/token'))
    )
    const statuses = responses.map((r) => r.status())

    expect(
      statuses,
      `esperaba 200 en las ${CONCURRENT_REQUESTS} requests concurrentes -- un 401 indica que una rotación de cookie ` +
      `pisó a otra y dejó a este cliente con un cookie de sesión superado (F28)`
    ).toEqual(Array(CONCURRENT_REQUESTS).fill(200))

    // La sesión debe seguir sirviendo con normalidad después de la ráfaga --
    // no solo "no crasheó", sino que el cookie que finalmente quedó vigente
    // sigue siendo válido para requests posteriores.
    expect(await page.request.get('/api/realtime/token').then((r) => r.status())).toBe(200)
  })
})
