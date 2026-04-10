import { expect, test } from '@playwright/test'
import { login } from '../utils/auth'
import { mockNuevaCotizacionApis } from '../utils/quotation-mocks'

test('carga la pantalla de nueva cotización con datos iniciales', async ({ page }) => {
  await mockNuevaCotizacionApis(page)
  await login(page, '/cotizaciones/nueva')

  await expect(page.getByRole('heading', { name: 'Nueva Cotizacion' })).toBeVisible()
  await expect(page.getByText('Folio:')).toBeVisible()
  await expect(page.getByText('SH123')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar Borrador' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generar Cotizacion' })).toBeVisible()
})
