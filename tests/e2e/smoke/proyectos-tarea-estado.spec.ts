import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectoDetallePMConTipo } from '../utils/proyectos-pm-mocks'

const PROYECTO_ID = 'SH301'

test('tablero de tareas: crea una tarea y la ve en la columna Pendiente', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: 'Tablero de tareas' }).click()
  await expect(page.getByText('Confirmar permiso de locación')).toBeVisible()
  await expect(page.getByText('Grabación día 1')).toBeVisible()

  await page.getByRole('button', { name: '+ Nueva tarea' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible()
  await page.getByPlaceholder('Título de la tarea').fill('Tarea nueva E2E')

  const [crearRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes(`/api/proyectos/${PROYECTO_ID}/tareas`) && req.method() === 'POST'),
    page.getByRole('button', { name: 'Guardar' }).click(),
  ])
  expect(crearRequest.postDataJSON().titulo).toBe('Tarea nueva E2E')
  await expect(page.getByText('Tarea nueva E2E')).toBeVisible()
})

test('tablero de tareas: edita una tarea y cambia su estado', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: 'Tablero de tareas' }).click()
  await page.getByText('Confirmar permiso de locación').click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Editar tarea' })).toBeVisible()
  await dialog.locator('select').first().selectOption('COMPLETADA')

  const [actualizarRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/tareas/tarea-1') && req.method() === 'PUT'),
    dialog.getByRole('button', { name: 'Guardar' }).click(),
  ])
  expect(actualizarRequest.postDataJSON().estado).toBe('COMPLETADA')
})

test('tablero de tareas: agrega un ítem de checklist a una tarea existente', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: 'Tablero de tareas' }).click()
  await page.getByText('Grabación día 1').click()

  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Agregar ítem...').fill('Revisar equipo de audio')

  const [checklistRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/checklist') && req.method() === 'POST'),
    dialog.getByRole('button', { name: 'Agregar', exact: true }).click(),
  ])
  expect(checklistRequest.postDataJSON().texto).toBe('Revisar equipo de audio')
  await expect(page.getByText('Revisar equipo de audio')).toBeVisible()
})
