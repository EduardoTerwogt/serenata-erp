import { expect, Page } from '@playwright/test'

const DEFAULT_EMAIL = 'e2e@serenata.test'
const DEFAULT_PASSWORD = 'playwright123'
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'

export function getPlaywrightCredentials() {
  return {
    email: process.env.PLAYWRIGHT_TEST_EMAIL || DEFAULT_EMAIL,
    password: process.env.PLAYWRIGHT_TEST_PASSWORD || DEFAULT_PASSWORD,
  }
}

export async function login(page: Page, callbackUrl = '/cuentas') {
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

  const { email, password } = getPlaywrightCredentials()

  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(new RegExp(escaped))
}
