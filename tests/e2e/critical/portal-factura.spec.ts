import { test, expect } from '@playwright/test'
import { mockPortalDashboard, mockPortalFacturaBloqueada, mockPortalFacturaValida } from '../utils/portal-mocks'

const CUENTA_ID = 'cuenta-1'

async function subirFactura(page: import('@playwright/test').Page) {
  await mockPortalDashboard(page)
  await page.goto(`/portal/cuentas/${CUENTA_ID}`)
  await expect(page.getByRole('heading', { name: 'Spot Verano' })).toBeVisible()

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles({ name: 'factura.xml', mimeType: 'application/xml', buffer: Buffer.from('<cfdi:Comprobante></cfdi:Comprobante>', 'utf-8') })
  await fileInputs.nth(1).setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
  await page.getByRole('button', { name: 'Subir factura' }).click()
}

test('factura que no cuadra: se bloquea y muestra el ejemplo con la explicación', async ({ page }) => {
  await mockPortalFacturaBloqueada(page)
  await subirFactura(page)

  await expect(page.getByText('Subtotal no coincide')).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).toBeVisible()
  await expect(page.getByText('$1,160.00')).toBeVisible()
  await expect(page.getByText('persona moral', { exact: false })).toBeVisible()

  // No debe haberse marcado como subida exitosamente
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('factura válida: se sube y confirma éxito', async ({ page }) => {
  await mockPortalFacturaValida(page)
  await subirFactura(page)

  await expect(page.getByText('Tu factura se subió correctamente')).toBeVisible()
})
