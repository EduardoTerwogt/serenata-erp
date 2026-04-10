import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

test.describe('live smoke', () => {
  test.skip(!liveEnabled, 'Live smoke tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('logs in and opens cuentas on a live environment', async ({ page }) => {
    await login(page, '/cuentas')
    await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Por Cobrar/i })).toBeVisible()
  })
})
