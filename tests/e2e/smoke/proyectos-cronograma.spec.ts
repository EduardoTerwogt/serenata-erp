import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectoDetallePMConTipo } from '../utils/proyectos-pm-mocks'

const PROYECTO_ID = 'SH302'

test('cronograma: muestra las tareas con fecha límite como barras del Gantt', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: 'Cronograma' }).click()

  await expect(page.getByRole('heading', { name: 'Cronograma del proyecto' })).toBeVisible()
  await expect(page.getByText('Confirmar permiso de locación').first()).toBeVisible()
  await expect(page.getByText('Grabación día 1').first()).toBeVisible()
})
