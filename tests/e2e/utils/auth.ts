import { expect, Page } from '@playwright/test'
import { normalizeUserSections } from '@/lib/authz'

const DEFAULT_EMAIL = 'e2e@serenata.test'
const DEFAULT_PASSWORD = 'playwright123'
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'

export function getPlaywrightCredentials() {
  return {
    email: process.env.PLAYWRIGHT_TEST_EMAIL || DEFAULT_EMAIL,
    password: process.env.PLAYWRIGHT_TEST_PASSWORD || DEFAULT_PASSWORD,
  }
}

/**
 * `credentials` permite entrar como un usuario distinto al del entorno — lo necesitan
 * las pruebas de colaboración real, que abren dos sesiones simultáneas con dos
 * usuarios diferentes. Sin él, todas las llamadas usan las credenciales de entorno,
 * como hasta ahora.
 */
export async function login(
  page: Page,
  callbackUrl = '/cuentas',
  credentials?: { email: string; password: string }
) {
  const escaped = callbackUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  if (process.env.PLAYWRIGHT_E2E_BYPASS === 'true') {
    await page.context().addCookies([
      {
        name: 'e2e-bypass',
        value: '1',
        url: process.env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL,
      },
    ])
    await page.goto(callbackUrl)
    await expect(page).toHaveURL(new RegExp(escaped))
    return
  }

  const { email, password } = credentials || getPlaywrightCredentials()

  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(new RegExp(escaped))
}

/**
 * Con el bypass de E2E no hay JWT, así que `useSession()` del cliente no trae
 * secciones. Las pruebas de acciones solo de admin (B7 de Cuentas) le dan al
 * cliente una sesión admin; el servidor ya trata al bypass como admin.
 */
export async function mockSesionAdmin(page: Page) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        // Como la sesión real: auth.ts guarda las secciones ya normalizadas (admin implica todas).
        user: { id: 'e2e-bypass-user', email: 'e2e@serenata.test', name: 'E2E User', sections: normalizeUserSections(['admin']) },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
  )
}
