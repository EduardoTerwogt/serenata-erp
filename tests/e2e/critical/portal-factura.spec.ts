import { test, expect } from '@playwright/test'
import { mockPortalDashboard, mockPortalFacturaBloqueada, mockPortalFacturaValida } from '../utils/portal-mocks'

async function irATabCuentasYSeleccionar(page: import('@playwright/test').Page) {
  await mockPortalDashboard(page)
  await page.goto('/portal')
  await page.getByRole('button', { name: 'Cuentas y facturas' }).click()

  await page.locator('select').selectOption('grupo-1')

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles({ name: 'factura.xml', mimeType: 'application/xml', buffer: Buffer.from('<cfdi:Comprobante></cfdi:Comprobante>', 'utf-8') })
  await fileInputs.nth(1).setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
  await page.getByRole('button', { name: 'Validar y subir factura' }).click()
}

test('factura que no cuadra: se bloquea y muestra el ejemplo con la explicación', async ({ page }) => {
  await mockPortalFacturaBloqueada(page)
  await irATabCuentasYSeleccionar(page)

  await expect(page.getByText('Subtotal no coincide')).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).toBeVisible()
  await expect(page.getByText('$1,160.00')).toBeVisible()
  await expect(page.getByText('persona moral', { exact: false })).toBeVisible()
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('factura válida: se sube y confirma éxito', async ({ page }) => {
  await mockPortalFacturaValida(page)
  await irATabCuentasYSeleccionar(page)

  await expect(page.getByText('Tu factura se subió correctamente')).toBeVisible()
})
