import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectosApis, PROYECTO_E2E_ID } from '../utils/proyectos-mocks'

test('lista de proyectos carga y permite buscar', async ({ page }) => {
  await mockProyectosApis(page)
  await login(page, '/proyectos')

  // Tablero (default) muestra el proyecto sin tipo asignado en la sección
  // "Sin tipo asignado" -- la búsqueda vive en el tab "Lista" (Bloque 3.8).
  await expect(page.getByText('Spot Verano E2E')).toBeVisible()

  await page.getByRole('button', { name: 'Lista' }).click()

  // El buscador es "expandable" (rediseño Apple-style): arranca colapsado
  // en un botón de solo ícono y hay que abrirlo antes de poder escribir.
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.locator('input[placeholder="Buscar por proyecto, cliente o folio…"]')).toBeVisible()

  await page.locator('input[placeholder="Buscar por proyecto, cliente o folio…"]').fill('no-existe-xyz')
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
