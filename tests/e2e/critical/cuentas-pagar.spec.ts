import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { E2E_IDS, mockCuentasApis } from '../utils/cuentas-mocks'

test('genera orden de pago PDF y registra pago en cuentas por pagar', async ({ page }) => {
  await mockCuentasApis(page)
  await login(page, '/cuentas')

  await page.getByRole('button', { name: /Por Pagar/i }).click()
  await expect(page.getByRole('cell', { name: 'José García' }).first()).toBeVisible()

  await page.locator('tr').filter({ hasText: 'José García' }).first().click()
  await expect(page.getByRole('heading', { name: 'SH054' })).toBeVisible()

  await page.getByRole('button', { name: 'Documentos', exact: true }).click()
  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles({
    name: 'factura_proveedor.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from('<cfdi:Comprobante Fecha="2026-04-08T09:30:00" Total="8700.00"></cfdi:Comprobante>', 'utf-8'),
  })
  await fileInputs.nth(1).setInputFiles({
    name: 'factura_proveedor.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8'),
  })
  await page.getByRole('button', { name: 'Subir Factura Proveedor' }).click()
  await expect(page.getByText('Factura proveedor subida correctamente')).toBeVisible()

  await page.getByRole('button', { name: 'Información', exact: true }).click()
  await expect(page.getByText('2026-04-08').first()).toBeVisible()

  await page.getByRole('button', { name: 'Registrar Pago', exact: true }).first().click()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

  await page.getByRole('button', { name: 'Generar Orden de Pago' }).click()
  await expect(page.getByRole('heading', { name: 'Generar Orden de Pago' })).toBeVisible()
  await expect(page.getByText('José García').first()).toBeVisible()

  await page.getByRole('button', { name: 'Generar Orden PDF' }).click()
  const pdfLink = page.getByRole('link', { name: 'Abrir PDF' })
  await expect(pdfLink).toBeVisible()
  await expect(pdfLink).toHaveAttribute('href', E2E_IDS.pdfPath)

  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByText('O.P 18-Abr SH054', { exact: false }).first()).toBeVisible()

  await page.locator('tr').filter({ hasText: 'José García' }).first().click()
  await page.getByRole('button', { name: 'Registrar Pago', exact: true }).first().click()

  const form = page.locator('form')
  await form.locator('input[placeholder="0.00"]').fill('7500')
  await form.getByRole('button', { name: 'Registrar Pago' }).click()

  await expect(page.getByText('Pago registrado correctamente').first()).toBeVisible()
  await expect(page.getByText('Esta cuenta ya está totalmente pagada.').first()).toBeVisible()
})
