import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { ETAPA_PREPROD_ID, ETAPA_RODAJE_ID, TIPO_GRABACION_ID, mockTiposProyectoApis } from '../utils/proyectos-pm-mocks'

test('tipos de proyecto: muestra etapas, crea tipo y reordena una etapa', async ({ page }) => {
  await mockTiposProyectoApis(page)
  await login(page, '/proyectos/tipos')

  await expect(page.getByRole('heading', { name: 'Tipos de proyecto' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Grabación' })).toBeVisible()
  await expect(page.getByText('Preproducción')).toBeVisible()
  await expect(page.getByText('Rodaje')).toBeVisible()
  await expect(page.getByText('1 proyecto activo')).toBeVisible()

  // Crear tipo nuevo
  await page.getByRole('button', { name: 'Nuevo tipo de proyecto' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo tipo de proyecto' })).toBeVisible()
  await page.getByPlaceholder('Nombre del tipo').fill('Concierto E2E')

  const [crearRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/api/tipos-proyecto') && req.method() === 'POST'),
    page.getByRole('button', { name: 'Crear tipo' }).click(),
  ])
  expect(crearRequest.postDataJSON()).toEqual({ nombre: 'Concierto E2E' })

  // Reordenar: mover Rodaje hacia arriba debe intercambiar orden con Preproducción
  const [reqRodaje, reqPreprod] = await Promise.all([
    page.waitForRequest((req) => req.url().includes(`/etapas/${ETAPA_RODAJE_ID}`) && req.method() === 'PUT'),
    page.waitForRequest((req) => req.url().includes(`/etapas/${ETAPA_PREPROD_ID}`) && req.method() === 'PUT'),
    page.getByRole('button', { name: 'Mover Rodaje arriba' }).click(),
  ])
  expect(reqRodaje.postDataJSON()).toEqual({ orden: 1 })
  expect(reqPreprod.postDataJSON()).toEqual({ orden: 2 })
})

test('tipos de proyecto: bloquea el borrado de una etapa con proyectos', async ({ page }) => {
  await mockTiposProyectoApis(page)
  await login(page, '/proyectos/tipos')

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('No se puede eliminar')
    void dialog.dismiss()
  })

  await page.getByRole('button', { name: 'Eliminar etapa Preproducción' }).click()

  await expect(page.getByRole('heading', { name: 'Grabación' })).toBeVisible()
})

test('tipos de proyecto: agrega una nueva etapa', async ({ page }) => {
  await mockTiposProyectoApis(page)
  await login(page, `/proyectos/tipos`)

  await page.getByRole('button', { name: '+ Etapa' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nueva etapa' })).toBeVisible()
  await page.getByPlaceholder('Nombre de la etapa').fill('Postproducción E2E')

  const [crearEtapaRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes(`/api/tipos-proyecto/${TIPO_GRABACION_ID}/etapas`) && req.method() === 'POST'),
    page.getByRole('button', { name: 'Crear etapa' }).click(),
  ])
  const body = crearEtapaRequest.postDataJSON()
  expect(body.nombre).toBe('Postproducción E2E')
  expect(body.orden).toBe(3)
})
