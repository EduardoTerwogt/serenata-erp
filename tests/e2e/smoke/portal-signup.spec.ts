import { test, expect } from '@playwright/test'
import { mockPortalSignupSinMatch, mockPortalSignupConMatch, mockPortalDashboard } from '../utils/portal-mocks'
// mockPortalSignupConMatch trae su propio /api/portal/cuentas y /api/portal/me
// con estado -- no se compone con mockPortalDashboard (ver nota en el mock).

async function llenarFormularioSignup(page: import('@playwright/test').Page) {
  await page.getByPlaceholder('Como aparece en tu identificación').fill('Jose Gutierrez')
  await page.getByPlaceholder('tu@correo.com').fill('jose@correo.com')
  await page.getByPlaceholder('Mínimo 8 caracteres').fill('password123')

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles({ name: 'ine.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('contenido', 'utf-8') })
  await fileInputs.nth(1).setInputFiles({ name: 'constancia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })

  await page.getByRole('button', { name: 'Crear cuenta' }).click()
}

test('signup sin match: crea la cuenta y entra directo al portal', async ({ page }) => {
  await mockPortalSignupSinMatch(page)
  await mockPortalDashboard(page)

  await page.goto('/portal/signup')
  await llenarFormularioSignup(page)

  await page.waitForURL('**/portal')
  await expect(page.getByText('Hola, Antonio Gutierrez')).toBeVisible()
})

test('signup con match: pide confirmar identidad antes de entrar', async ({ page }) => {
  await mockPortalSignupConMatch(page)

  await page.goto('/portal/signup')
  await llenarFormularioSignup(page)

  await page.waitForURL('**/portal/confirmar-identidad')
  await expect(page.getByText('¿Eres tú?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sí, soy Antonio Gutierrez' })).toBeVisible()

  await page.getByRole('button', { name: 'Sí, soy Antonio Gutierrez' }).click()

  await page.waitForURL('**/portal')
})
