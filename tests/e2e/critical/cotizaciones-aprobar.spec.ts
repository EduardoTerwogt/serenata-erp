import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCotizacionDetailApis } from '../utils/quotation-detail-mocks'

test('aprueba una cotización EMITIDA', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-APROBAR', estado: 'EMITIDA' })
  await login(page, '/cotizaciones/SH-E2E-APROBAR')

  await expect(page.getByText('EMITIDA', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Aprobar Cotización' }).click()

  await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
  await expect(page.getByText('APROBADA', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear Complementaria' })).toBeVisible()
})
