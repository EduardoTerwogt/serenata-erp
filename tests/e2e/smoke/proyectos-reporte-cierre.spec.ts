import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectoDetallePMConTipo } from '../utils/proyectos-pm-mocks'

const PROYECTO_ID = 'SH304'

test('reporte de cierre: muestra "no disponible" cuando el proyecto no ha cerrado', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: 'Reporte de cierre' }).click()
  await expect(page.getByText('No disponible aún -- este reporte se genera automáticamente')).toBeVisible()
})

const REPORTE_CIERRE_DOC = {
  id: 'doc-cierre', proyecto_id: PROYECTO_ID, tipo: 'REPORTE_CIERRE', titulo: null,
  contenido: {
    fecha_cierre: '2026-05-01',
    financiero: { total_cotizado: 100000, total_cobrado: 80000, total_pagado: 60000 },
    hitos: [{ titulo: 'Grabación día 1', planeado: '2026-04-25', real: '2026-04-26' }],
    incidencias: 'Retraso por lluvia el primer día.',
  },
  archivo_url: null, archivo_nombre: null, auto_generado_at: '2026-05-01T00:00:00Z', editado_manualmente: false,
  created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
}

test('reporte de cierre: muestra datos generados, edita incidencias y descarga el PDF', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID, [REPORTE_CIERRE_DOC])
  await page.route(`**/api/proyectos/${PROYECTO_ID}/reporte-cierre/pdf`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 fake') })
  })
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: 'Reporte de cierre' }).click()
  await expect(page.getByText('Proyecto finalizado el')).toBeVisible()
  await expect(page.getByText('$100,000.00')).toBeVisible()
  await expect(page.getByText('$80,000.00')).toBeVisible()
  await expect(page.getByText('Grabación día 1')).toBeVisible()

  const incidenciasField = page.getByPlaceholder('Describe incidencias, aprendizajes o notas de cierre...')
  await expect(incidenciasField).toHaveValue('Retraso por lluvia el primer día.')
  await incidenciasField.fill('Retraso por lluvia. Se recuperó el día siguiente.')

  const [guardarRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/documentos/doc-cierre') && req.method() === 'PUT'),
    page.getByRole('button', { name: 'Guardar' }).click(),
  ])
  expect(guardarRequest.postDataJSON().contenido.incidencias).toBe('Retraso por lluvia. Se recuperó el día siguiente.')

  const [pdfRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/reporte-cierre/pdf')),
    page.getByRole('button', { name: 'Descargar PDF' }).click(),
  ])
  expect(pdfRequest.url()).toContain(`/api/proyectos/${PROYECTO_ID}/reporte-cierre/pdf`)
})

test('documentos: abrir la tarjeta de Reporte de cierre cambia de tab en vez de abrir un modal', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID, [REPORTE_CIERRE_DOC])
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: '9 documentos PM' }).click()
  const reporteCierreCardBody = page
    .getByText('Aparece automáticamente cuando el proyecto pasa a su etapa final.')
    .locator('..')
  await reporteCierreCardBody.getByRole('button', { name: 'Abrir' }).click()

  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText('Proyecto finalizado el')).toBeVisible()
})
