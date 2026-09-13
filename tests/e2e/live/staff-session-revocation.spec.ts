import { test, expect, BrowserContext, Page } from '@playwright/test'
import { login } from '../utils/auth'
import { faltantesDelEntornoLive, liveEnabled } from '../utils/live-helpers'
import { cleanupLiveUser, ensureLiveUser } from '../utils/live-users'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'

/**
 * EF-2 1B-2b: revocación de sesión de staff (espejo del diseño ya probado
 * para el Portal). El caso "JWT sin claim sessionVersion" es determinista
 * y se cubre como test unitario en `__tests__/proxy.test.ts` -- no se
 * duplica aquí, que sí requiere infraestructura live real (Postgres +
 * login real) para probar la revocación real por `session_version`.
 *
 * `GET /api/realtime/token` es el endpoint usado como sonda: usa
 * `requireAuthenticated()` directo, sin exigir ninguna sección específica
 * -- el mínimo necesario para ejercer exactamente el chequeo de revocación,
 * sin que las reglas de sección de `proxy.ts` interfieran.
 */

const PREFIJO = 'E2E-LIVE-REVOCATION-'

const ADMIN = {
  email: `${PREFIJO}admin@serenata.test`.toLowerCase(),
  password: 'RevocationAdmin-live-2026',
  name: 'Revocation Admin',
  sections: ['admin'],
}

const TARGET_EMAIL = `${PREFIJO}target@serenata.test`.toLowerCase()
const TARGET_PASSWORD = 'RevocationTarget-live-2026'
const TARGET_NAME = 'Revocation Target'
const TARGET_SECTIONS = ['dashboard']

async function resetTargetUser() {
  await ensureLiveUser({ email: TARGET_EMAIL, password: TARGET_PASSWORD, name: TARGET_NAME, sections: TARGET_SECTIONS })
}

async function getTargetId(): Promise<string> {
  const supabase = getLiveSupabaseAdmin()
  const { data, error } = await supabase.from('usuarios').select('id').eq('email', TARGET_EMAIL).single()
  if (error) throw error
  return (data as { id: string }).id
}

async function loginTarget(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await login(page, '/dashboard', { email: TARGET_EMAIL, password: TARGET_PASSWORD })
  return page
}

function tokenStatus(page: Page) {
  return page.request.get('/api/realtime/token').then((r) => r.status())
}

test.describe('live: guard del entorno (revocación de sesión de staff)', () => {
  test('el entorno live está configurado cuando CI lo exige', () => {
    test.skip(process.env.PLAYWRIGHT_LIVE_REQUIRED !== 'true', 'Solo aplica en el job live de CI')
    expect(faltantesDelEntornoLive(), 'Faltan variables del entorno live').toEqual([])
  })
})

test.describe('live: revocación de sesión de staff (session_version)', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')
  test.describe.configure({ mode: 'serial' })

  let contextAdmin: BrowserContext
  let pageAdmin: Page
  let targetId = ''

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000)

    await ensureLiveUser(ADMIN)
    await resetTargetUser()

    contextAdmin = await browser.newContext()
    pageAdmin = await contextAdmin.newPage()
    await login(pageAdmin, '/dashboard', { email: ADMIN.email, password: ADMIN.password })

    targetId = await getTargetId()
  })

  test.afterAll(async () => {
    await contextAdmin?.close()
    await cleanupLiveUser(ADMIN.email).catch((e) => console.error('[live revocation] cleanup admin:', e))
    await cleanupLiveUser(TARGET_EMAIL).catch((e) => console.error('[live revocation] cleanup target:', e))
  })

  test('desactivar al usuario invalida su sesión: 401 "Sesión invalidada" en su siguiente request', async ({ browser }) => {
    await resetTargetUser()
    const contextTarget = await browser.newContext()
    const pageTarget = await loginTarget(contextTarget)

    expect(await tokenStatus(pageTarget), 'la sesión debería estar vigente antes de desactivar').toBe(200)

    const putResponse = await pageAdmin.request.put(`/api/admin/usuarios/${targetId}`, { data: { active: false } })
    expect(putResponse.ok(), `PUT desactivar falló: ${putResponse.status()}`).toBeTruthy()

    const response = await pageTarget.request.get('/api/realtime/token')
    expect(response.status()).toBe(401)
    const body = await response.json() as { error: string }
    expect(body.error).toBe('Sesión invalidada')

    await contextTarget.close()
  })

  test('cambiar las secciones invalida la sesión: 401 + requiere relogin, nunca adopta las secciones nuevas en caliente', async ({ browser }) => {
    await resetTargetUser()
    const contextTarget = await browser.newContext()
    const pageTarget = await loginTarget(contextTarget)

    expect(await tokenStatus(pageTarget)).toBe(200)

    const putResponse = await pageAdmin.request.put(`/api/admin/usuarios/${targetId}`, {
      data: { sections: ['dashboard', 'cotizaciones'] },
    })
    expect(putResponse.ok(), `PUT sections falló: ${putResponse.status()}`).toBeTruthy()

    // La sesión vieja cae -- nunca "ve" las secciones nuevas sin volver a
    // loguearse (ver corrección de v3: session_version bumpeado por
    // sections implica 401, no adopción en caliente).
    expect(await tokenStatus(pageTarget)).toBe(401)

    // Un login nuevo sí trae la sesión al día.
    const pageTargetRelogueado = await loginTarget(contextTarget)
    expect(await tokenStatus(pageTargetRelogueado)).toBe(200)

    await contextTarget.close()
  })

  test('cambiar el password invalida la sesión vieja', async ({ browser }) => {
    await resetTargetUser()
    const contextTarget = await browser.newContext()
    const pageTarget = await loginTarget(contextTarget)

    expect(await tokenStatus(pageTarget)).toBe(200)

    const putResponse = await pageAdmin.request.put(`/api/admin/usuarios/${targetId}`, {
      data: { password: 'NuevaPasswordSegura2026' },
    })
    expect(putResponse.ok(), `PUT password falló: ${putResponse.status()}`).toBeTruthy()

    expect(await tokenStatus(pageTarget)).toBe(401)

    await contextTarget.close()
  })

  test('un cambio que NO toca active/sections/password/email (solo name) no genera ningún logout espurio', async ({ browser }) => {
    await resetTargetUser()
    const contextTarget = await browser.newContext()
    const pageTarget = await loginTarget(contextTarget)

    expect(await tokenStatus(pageTarget)).toBe(200)

    const putResponse = await pageAdmin.request.put(`/api/admin/usuarios/${targetId}`, {
      data: { name: 'Revocation Target Renombrado' },
    })
    expect(putResponse.ok(), `PUT name falló: ${putResponse.status()}`).toBeTruthy()

    // La sesión sigue vigente -- cero logouts espurios por un cambio que
    // no invalida nada.
    expect(await tokenStatus(pageTarget)).toBe(200)

    await contextTarget.close()
  })
})
