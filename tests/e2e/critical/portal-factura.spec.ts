import { test, expect } from '@playwright/test'
import {
  mockPortalDashboard,
  mockPortalFacturaBloqueada,
  mockPortalFacturaDesgloseIncorrecto,
  mockPortalFacturaRegimenIncorrecto,
  mockPortalFacturaValida,
} from '../utils/portal-mocks'

async function irATabCuentas(page: import('@playwright/test').Page) {
  await mockPortalDashboard(page)
  await page.goto('/portal')
  await page.getByRole('button', { name: 'Cuentas y facturas' }).click()
}

async function seleccionarYSubir(page: import('@playwright/test').Page) {
  await page.locator('select').selectOption('grupo-1')

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles({ name: 'factura.xml', mimeType: 'application/xml', buffer: Buffer.from('<cfdi:Comprobante></cfdi:Comprobante>', 'utf-8') })
  await fileInputs.nth(1).setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
  await page.getByRole('button', { name: 'Validar y subir factura' }).click()
}

test('mismatch de subtotal: muestra ambos montos e invita a contactar a Serenata, sin el bloque de ejemplo', async ({ page }) => {
  await mockPortalFacturaBloqueada(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('$900.00', { exact: false })).toBeVisible()
  await expect(page.getByText('ponte en contacto con nosotros', { exact: false })).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).not.toBeVisible()
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('mismatch de retenciones: mensaje genérico de régimen fiscal, sin el bloque de ejemplo', async ({ page }) => {
  await mockPortalFacturaRegimenIncorrecto(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('no corresponden a tu régimen fiscal', { exact: false })).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).not.toBeVisible()
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('mismatch de desglose (subtotal correcto): mensaje específico y bloque de ejemplo', async ({ page }) => {
  await mockPortalFacturaDesgloseIncorrecto(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('IVA trasladado no coincide')).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).toBeVisible()
  // "persona moral" aparece dos veces (bloque de ejemplo post-error + panel
  // Simulador, ambos visibles a la vez con el mismo grupo seleccionado).
  await expect(page.getByText('persona moral', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('factura válida: se sube y confirma éxito', async ({ page }) => {
  await mockPortalFacturaValida(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('Tu factura se subió correctamente')).toBeVisible()
})

test('simulador de factura: se autollena al elegir proyecto, sin subir archivos', async ({ page }) => {
  await irATabCuentas(page)

  await expect(page.getByText('Elige un proyecto en "Subir factura"', { exact: false })).toBeVisible()

  await page.locator('select').selectOption('grupo-1')

  await expect(page.getByText('Así debe quedar tu factura para este proyecto:')).toBeVisible()
  await expect(page.getByText('$1,160.00')).toBeVisible()
  await expect(page.getByText('persona moral', { exact: false })).toBeVisible()
})
