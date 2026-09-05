import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCotizacionDetailApis } from '../utils/quotation-detail-mocks'

test('genera PDF y lo guarda en Drive desde una cotización EMITIDA', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-PDF', estado: 'EMITIDA' })
  await login(page, '/cotizaciones/SH-E2E-PDF')

  await page.getByRole('button', { name: 'Generar PDF' }).click()

  await expect(page.getByText('PDF guardado exitosamente en Drive')).toBeVisible()
  const driveLink = page.getByRole('link', { name: 'Ver en Drive →' })
  await expect(driveLink).toHaveAttribute('href', 'https://drive.google.com/file/d/drive-e2e-1/view')
})
