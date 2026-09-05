import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockServiceTemplatesApis } from '../utils/service-templates-mocks'

test('crea una plantilla de servicio nueva', async ({ page }) => {
  await mockServiceTemplatesApis(page)
  await login(page, '/plantillas-servicios/nueva')

  await page.locator('input[placeholder="Ej: Suena la Ciudad"]').fill('Plantilla E2E')

  const firstRow = page.locator('table tbody tr').first()
  await firstRow.locator('input[placeholder="Descripción..."]').fill('Renta de audio')

  await page.getByRole('button', { name: 'Guardar Plantilla' }).click()

  await expect(page).toHaveURL(/\/plantillas-servicios$/)
})

test('lista de plantillas: duplicar y eliminar', async ({ page }) => {
  await mockServiceTemplatesApis(page)
  await login(page, '/plantillas-servicios')

  await expect(page.getByText('Low Clika')).toBeVisible()

  await page.getByRole('button', { name: 'Duplicar' }).click()
  await expect(page.getByText('Low Clika (copia)')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Eliminar' }).first().click()

  await expect(page.getByRole('heading', { name: 'Low Clika', exact: true })).not.toBeVisible()
  await expect(page.getByText('Low Clika (copia)')).toBeVisible()
})
