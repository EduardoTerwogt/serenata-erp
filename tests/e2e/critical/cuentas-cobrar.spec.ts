import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasApis } from '../utils/cuentas-mocks'

test('handles documentos y pagos en cuentas por cobrar', async ({ page }) => {
  await mockCuentasApis(page)
  await login(page, '/cuentas')

  await page.locator('tr').filter({ hasText: 'Walmart México' }).first().click()
  await expect(page.getByRole('heading', { name: 'SH054' })).toBeVisible()

  await page.getByRole('button', { name: 'Documentos', exact: true }).click()

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles({
    name: 'factura.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from('<cfdi:Comprobante Folio="F001" Fecha="2026-04-09T10:00:00" Total="9500.00"></cfdi:Comprobante>', 'utf-8'),
  })
  await fileInputs.nth(1).setInputFiles({
    name: 'factura.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8'),
  })
  await page.getByRole('button', { name: 'Subir Factura' }).click()
  await expect(page.getByText('Factura subida correctamente')).toBeVisible()

  await fileInputs.nth(2).setInputFiles({
    name: 'complemento.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from('<cfdi:Comprobante><cfdi:Complemento><pago20:Pagos MontoTotalPagos="4750"><pago20:Pago FechaPago="2026-04-18T12:00:00" MonedaP="MXN" /></pago20:Pagos><tfd:TimbreFiscalDigital UUID="ABC-123" /></cfdi:Complemento></cfdi:Comprobante>', 'utf-8'),
  })
  await fileInputs.nth(3).setInputFiles({
    name: 'complemento.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8'),
  })
  await page.getByRole('button', { name: 'Subir Complemento' }).click()
  await expect(page.getByText('Complemento subido correctamente')).toBeVisible()

  await page.getByRole('button', { name: 'Registrar Pago', exact: true }).first().click()

  const form = page.locator('form')
  await form.locator('input[placeholder="0.00"]').fill('4750')
  await form.locator('input[type="date"]').fill('2026-04-18')
  await form.getByRole('button', { name: 'Registrar Pago' }).click()

  await expect(page.getByText('Pago registrado correctamente').first()).toBeVisible()
  await expect(page.getByText(/PAGADO/i).first()).toBeVisible()
})
