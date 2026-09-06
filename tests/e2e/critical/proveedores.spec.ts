import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProveedoresApis, PROVEEDOR_E2E_ID } from '../utils/proveedores-mocks'

test('lista de proveedores carga y permite buscar', async ({ page }) => {
  await mockProveedoresApis(page)
  await login(page, '/proveedores')

  await expect(page.getByText('Diego Torres')).toBeVisible()

  await page.locator('input[placeholder="Buscar por nombre..."]').fill('no-existe-xyz')
  await expect(page.getByText('Diego Torres')).not.toBeVisible()
})

test('crea un nuevo proveedor', async ({ page }) => {
  await mockProveedoresApis(page)
  await login(page, '/proveedores/nueva')

  await page.locator('input[placeholder="Nombre del proveedor"]').fill('Renata Villaseñor')
  await page.locator('input[placeholder="Ej. Director de Fotografía"]').fill('Editora')
  await page.getByRole('button', { name: 'Agregar' }).click()
  await page.locator('input[placeholder="Nombre del banco"]').fill('Banorte')

  await page.getByRole('button', { name: 'Crear Proveedor' }).click()

  await expect(page).toHaveURL(/\/proveedores\/resp-e2e-new/)
})

test('detalle de proveedor: edita, activa/desactiva y muestra historial', async ({ page }) => {
  await mockProveedoresApis(page)
  await login(page, `/proveedores/${PROVEEDOR_E2E_ID}`)

  await expect(page.getByRole('heading', { name: 'Diego Torres' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Documental Raíces' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '$8,000.00' })).toBeVisible()

  await page.getByLabel('Proveedor activo').uncheck()
  await page.getByRole('button', { name: 'Guardar Cambios' }).click()

  await expect(page.getByText('Proveedor actualizado correctamente')).toBeVisible()
})
