import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasApis } from '../utils/cuentas-mocks'

test('lista de cuentas: toggle Por Cobrar/Por Pagar y búsqueda', async ({ page }) => {
  await mockCuentasApis(page)
  await login(page, '/cuentas')

  await expect(page.getByRole('cell', { name: 'Walmart México' })).toBeVisible()

  await page.getByRole('button', { name: /Por Pagar/i }).click()
  await expect(page.getByRole('cell', { name: 'José García' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Walmart México' })).not.toBeVisible()

  await page.locator('input[placeholder*="Buscar por folio"]').fill('no-existe-xyz')
  await expect(page.getByRole('cell', { name: 'José García' })).not.toBeVisible()
})
