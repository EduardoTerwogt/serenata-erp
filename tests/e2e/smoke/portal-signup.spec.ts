import { test, expect } from '@playwright/test'
import { mockPortalSignup, mockPortalDashboard, mockPortalDashboardConMatch } from '../utils/portal-mocks'

test('signup es ligero: correo, password y alias opcional -- sin documentos', async ({ page }) => {
  await mockPortalSignup(page)
  await mockPortalDashboard(page, { documentos: [] })

  await page.goto('/portal/signup')
  await page.getByPlaceholder('Ej. Chok').fill('Chok')
  await page.getByPlaceholder('tu@correo.com').fill('jose@correo.com')
  await page.getByPlaceholder('Mínimo 8 caracteres').fill('password123')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  await page.waitForURL('**/portal')
  await expect(page.getByRole('button', { name: 'Mis datos' })).toBeVisible()
  // Sin INE/constancia subidos todavía -- debe verse el aviso de documentación pendiente.
  await expect(page.getByText('Sube tu documentación para completar tu perfil')).toBeVisible()
})

test('subir INE/constancia dispara el matching: pide confirmar identidad antes de dejarlo entrar', async ({ page }) => {
  await mockPortalDashboardConMatch(page)

  await page.goto('/portal')
  await page.getByRole('button', { name: 'Documentación' }).click()

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.first().setInputFiles({ name: 'ine.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('contenido', 'utf-8') })

  await page.waitForURL('**/portal/confirmar-identidad')
  await expect(page.getByText('¿Eres tú?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sí, soy Antonio Gutierrez' })).toBeVisible()

  await page.getByRole('button', { name: 'Sí, soy Antonio Gutierrez' }).click()

  await page.waitForURL('**/portal')
  await expect(page.getByText('Antonio Gutierrez').first()).toBeVisible()
})
