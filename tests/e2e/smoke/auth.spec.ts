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
  // Anclado al inicio: la vista "Por proyecto" (default) también tiene un
  // acordeón cuyo botón de header incluye el texto "Por cobrar $X / Por
  // pagar $Y", que un regex sin anclar también matchea.
  await expect(page.getByRole('button', { name: /^Cobrar/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Pagar/i })).toBeVisible()

  // Vista "Por proyecto" es la default (Fase 5.3 Bloque 3) -- cambia a
  // "Lista" para cubrir la tabla plana original con la misma prueba.
  await page.getByRole('button', { name: 'Lista' }).click()
  await expect(page.getByRole('cell', { name: 'Walmart México' })).toBeVisible()
})
