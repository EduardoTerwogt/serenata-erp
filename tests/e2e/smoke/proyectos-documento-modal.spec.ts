import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectoDetallePMConTipo } from '../utils/proyectos-pm-mocks'

const PROYECTO_ID = 'SH303'

test('documentos: abre el Brief, edita el objetivo y guarda', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: '9 documentos PM' }).click()
  await expect(page.getByText('Documentación del proyecto')).toBeVisible()
  await expect(page.getByText('Precargado').first()).toBeVisible()
  await expect(page.getByText('Vacío')).toBeVisible()

  const briefCardBody = page
    .getByText('Cliente, fechas y locación ya llenos desde la cotización. Falta objetivo y mensaje clave.')
    .locator('..')
  await briefCardBody.getByRole('button', { name: 'Abrir' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Brief' })).toBeVisible()
  await dialog.getByPlaceholder('¿Qué se busca lograr con este proyecto?').fill('Lanzar la campaña de verano')

  const [guardarRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/documentos/doc-brief') && req.method() === 'PUT'),
    dialog.getByRole('button', { name: 'Guardar' }).click(),
  ])
  expect(guardarRequest.postDataJSON().contenido.objetivo).toBe('Lanzar la campaña de verano')
})

test('documentos: crea un nuevo status report', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: '9 documentos PM' }).click()

  const [crearRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/documentos') && req.method() === 'POST'),
    page.getByRole('button', { name: '+ Nuevo status report' }).click(),
  ])
  expect(crearRequest.postDataJSON().tipo).toBe('STATUS_REPORT')

  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Status report' })).toBeVisible()
})
