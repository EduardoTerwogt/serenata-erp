import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProveedoresApis } from '../utils/proveedores-mocks'

test('lista de proveedores carga y permite buscar', async ({ page }) => {
  await mockProveedoresApis(page)
  await login(page, '/proveedores')

  await expect(page.getByText('Diego Torres')).toBeVisible()

  await page.locator('input[placeholder="Buscar por nombre…"]').fill('no-existe-xyz')
  await expect(page.getByText('Diego Torres')).not.toBeVisible()
})

test('crea un nuevo proveedor', async ({ page }) => {
  await mockProveedoresApis(page)
  await login(page, '/proveedores')

  await page.getByRole('button', { name: 'Nuevo proveedor' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo proveedor' })).toBeVisible()

  await page.locator('input[placeholder="Nombre y apellido"]').fill('Renata Villaseñor')
  await page.locator('input[placeholder="Ej. Director de Fotografía"]').fill('Editora')
  await page.getByRole('button', { name: 'Agregar' }).click()
  await page.locator('input[placeholder="Nombre del banco"]').fill('Banorte')

  await page.getByRole('button', { name: 'Crear proveedor' }).click()

  await expect(page.getByRole('heading', { name: 'Nuevo proveedor' })).not.toBeVisible()
  await expect(page.getByText('Renata Villaseñor')).toBeVisible()
})

test('detalle de proveedor: edita, activa/desactiva y muestra historial', async ({ page }) => {
  await mockProveedoresApis(page)
  await login(page, '/proveedores')

  await page.getByText('Diego Torres').click()
  await expect(page.getByRole('heading', { name: 'Diego Torres' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Documental Raíces' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '$8,000.00' })).toBeVisible()

  await page.getByRole('button', { name: 'Inactivo' }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(page.getByRole('heading', { name: 'Diego Torres' })).not.toBeVisible()
})
