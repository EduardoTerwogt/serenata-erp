import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectosApis, PROYECTO_E2E_ID } from '../utils/proyectos-mocks'

test('lista de proyectos carga y permite buscar', async ({ page }) => {
  await mockProyectosApis(page)
  await login(page, '/proyectos')

  await expect(page.getByText('Spot Verano E2E')).toBeVisible()

  await page.locator('input[placeholder="Buscar por proyecto, cliente o folio..."]').fill('no-existe-xyz')
  await expect(page.getByText('Spot Verano E2E')).not.toBeVisible()
})

test('detalle de proyecto: cambia estado y guarda datos generales', async ({ page }) => {
  await mockProyectosApis(page)
  await login(page, `/proyectos/${PROYECTO_E2E_ID}`)

  await expect(page.getByRole('heading', { name: 'Spot Verano E2E' })).toBeVisible()

  await page.locator('select').first().selectOption('RODAJE')
  await page.locator('input[placeholder="Lugar del evento"]').fill('Foro Sol')

  await page.getByRole('button', { name: 'Guardar Cambios' }).click()

  await expect(page.getByText('Proyecto actualizado correctamente')).toBeVisible()
})
