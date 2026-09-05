import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockResponsablesApis, RESPONSABLE_E2E_ID } from '../utils/responsables-mocks'

test('lista de responsables carga y permite buscar', async ({ page }) => {
  await mockResponsablesApis(page)
  await login(page, '/responsables')

  await expect(page.getByText('Diego Torres')).toBeVisible()

  await page.locator('input[placeholder="Buscar por nombre..."]').fill('no-existe-xyz')
  await expect(page.getByText('Diego Torres')).not.toBeVisible()
})

test('crea un nuevo responsable', async ({ page }) => {
  await mockResponsablesApis(page)
  await login(page, '/responsables/nueva')

  await page.locator('input[placeholder="Nombre del colaborador"]').fill('Renata Villaseñor')
  await page.locator('input[placeholder="Ej. Director de Fotografía"]').fill('Editora')
  await page.getByRole('button', { name: 'Agregar' }).click()
  await page.locator('input[placeholder="Nombre del banco"]').fill('Banorte')

  await page.getByRole('button', { name: 'Crear Colaborador' }).click()

  await expect(page).toHaveURL(/\/responsables\/resp-e2e-new/)
})

test('detalle de responsable: edita, activa/desactiva y muestra historial', async ({ page }) => {
  await mockResponsablesApis(page)
  await login(page, `/responsables/${RESPONSABLE_E2E_ID}`)

  await expect(page.getByRole('heading', { name: 'Diego Torres' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Documental Raíces' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '$8,000.00' })).toBeVisible()

  await page.getByLabel('Colaborador activo').uncheck()
  await page.getByRole('button', { name: 'Guardar Cambios' }).click()

  await expect(page.getByText('Colaborador actualizado correctamente')).toBeVisible()
})
