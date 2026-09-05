import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCotizacionDetailApis } from '../utils/quotation-detail-mocks'

test('cancela una cotización EMITIDA', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-CANCELAR', estado: 'EMITIDA' })
  await login(page, '/cotizaciones/SH-E2E-CANCELAR')

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Cancelar' }).click()

  await expect(page.getByText('Cotización cancelada. Proyecto y cuentas eliminados.')).toBeVisible()
  await expect(page.getByText('CANCELADA', { exact: true })).toBeVisible()
})
