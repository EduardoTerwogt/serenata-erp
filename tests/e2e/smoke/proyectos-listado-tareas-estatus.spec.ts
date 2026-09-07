import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectosListadoApis } from '../utils/proyectos-pm-mocks'

test('listado: tab Tareas agrupa por proyecto y muestra vencidas', async ({ page }) => {
  await mockProyectosListadoApis(page)
  await login(page, '/proyectos')

  await page.getByRole('button', { name: 'Tareas', exact: true }).click()
  await expect(page.getByText('Activación Primavera')).toBeVisible()
  await expect(page.getByText('Confirmar permiso de locación')).toBeVisible()
  await expect(page.getByText(/Venció/)).toBeVisible()
})

test('listado: tab Estatus muestra stats y el cronograma general', async ({ page }) => {
  await mockProyectosListadoApis(page)
  await login(page, '/proyectos')

  await page.getByRole('button', { name: 'Estatus y cronograma' }).click()
  await expect(page.getByText('Estatus general')).toBeVisible()
  await expect(page.getByText('Proyectos activos')).toBeVisible()
  await expect(page.getByText('Con tareas vencidas')).toBeVisible()
  await expect(page.getByText('Cronograma general (todos los proyectos)')).toBeVisible()
  // SH311 no tiene fecha_entrega ni fecha_cierre_real -- se omite del Gantt.
  await expect(page.getByText('1 proyecto sin fecha, no se muestran en el cronograma.')).toBeVisible()
})
