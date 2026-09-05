import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCotizacionDetailApis } from '../utils/quotation-detail-mocks'

test('edita información general de una cotización en BORRADOR (autosave)', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-EDITAR', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-EDITAR')

  await expect(page.getByRole('heading', { name: 'SH-E2E-EDITAR' })).toBeVisible()

  const proyectoInput = page.locator('input[placeholder="Nombre del proyecto"]')
  await proyectoInput.fill('Spot Verano Editado E2E')

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/general') && req.method() === 'PATCH'),
    page.locator('textarea[placeholder="Sin notas..."]').click(),
  ])

  expect(request.postDataJSON().proyecto).toBe('Spot Verano Editado E2E')
  await expect(proyectoInput).toHaveValue('Spot Verano Editado E2E')
})
