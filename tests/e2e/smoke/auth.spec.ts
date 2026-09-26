import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasPeriodo } from '../utils/cuentas-periodo-mocks'

test('redirects unauthenticated users to login when opening cuentas', async ({ page }) => {
  await page.goto('/cuentas')
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcuentas/)
})

test('loads the cuentas shell for e2e smoke coverage', async ({ page }) => {
  await mockCuentasPeriodo(page)
  await login(page, '/cuentas?anio=2026&mes=9')

  await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir Lanzamiento Aurora 2026' })).toBeVisible()

  await page.getByRole('button', { name: 'Lista' }).first().click()
  await expect(page.getByRole('cell', { name: /Iluminación Pro CDMX/ })).toBeVisible()
})
