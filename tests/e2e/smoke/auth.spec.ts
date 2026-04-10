import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasApis } from '../utils/cuentas-mocks'

test('redirects unauthenticated users to login when opening cuentas', async ({ page }) => {
  await page.goto('/cuentas')
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcuentas/)
})

test('loads the cuentas shell for e2e smoke coverage', async ({ page }) => {
  await mockCuentasApis(page)
  await login(page, '/cuentas')

  await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Por Cobrar/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Por Pagar/i })).toBeVisible()
  await expect(page.getByText('Walmart México')).toBeVisible()
})
