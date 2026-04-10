import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { E2E_IDS, mockCuentasApis } from '../utils/cuentas-mocks'

test('genera orden de pago PDF y registra pago en cuentas por pagar', async ({ page }) => {
  await mockCuentasApis(page)
  await login(page, '/cuentas')

  await page.getByRole('button', { name: /Por Pagar/i }).click()
  await expect(page.getByRole('cell', { name: 'José García' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Generar Orden de Pago' }).click()
  await expect(page.getByRole('heading', { name: 'Generar Orden de Pago' })).toBeVisible()
  await expect(page.getByText('José García').first()).toBeVisible()

  await page.getByRole('button', { name: 'Generar Orden PDF' }).click()
  const pdfLink = page.getByRole('link', { name: 'Abrir PDF' })
  await expect(pdfLink).toBeVisible()
  await expect(pdfLink).toHaveAttribute('href', E2E_IDS.pdfPath)

  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText('Orden_Pago_2026_04_18.pdf', { exact: true }).first()).toBeVisible()

  await page.locator('tr').filter({ hasText: 'José García' }).first().click()
  await page.getByRole('button', { name: 'Registrar Pago', exact: true }).first().click()

  const form = page.locator('form')
  await form.locator('input[placeholder="0.00"]').fill('7500')
  await form.getByRole('button', { name: 'Registrar Pago' }).click()

  await expect(page.getByText('Pago registrado correctamente').first()).toBeVisible()
  await expect(page.getByText('Esta cuenta ya está totalmente pagada.').first()).toBeVisible()
})
