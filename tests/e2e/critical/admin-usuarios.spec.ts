import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockAdminUsuariosApis } from '../utils/admin-usuarios-mocks'

test('crea un nuevo usuario', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await login(page, '/admin/usuarios')

  await page.getByRole('button', { name: '+ Nuevo usuario' }).click()

  await page.getByPlaceholder('Nombre completo').fill('Luis Peña')
  await page.getByPlaceholder('correo@ejemplo.com').fill('luis@serenata.test')
  await page.getByPlaceholder('Mínimo 8 caracteres').fill('supersecreta1')
  await page.getByLabel('Cotizaciones').check()

  await page.getByRole('button', { name: 'Crear usuario' }).click()

  await expect(page.getByText('Luis Peña')).toBeVisible()
})

test('edita secciones y desactiva un usuario existente', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await login(page, '/admin/usuarios')

  await expect(page.getByText('Ana Pérez')).toBeVisible()

  await page.getByRole('row', { name: /Ana Pérez/ }).getByRole('button', { name: 'Editar' }).click()
  await page.getByLabel('Proyectos').check()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(page.getByRole('button', { name: 'Editar' }).first()).toBeVisible()

  await page.getByRole('row', { name: /Ana Pérez/ }).getByRole('button', { name: 'Desactivar' }).click()
  await expect(page.getByRole('row', { name: /Ana Pérez/ }).getByText('Inactivo')).toBeVisible()
})
