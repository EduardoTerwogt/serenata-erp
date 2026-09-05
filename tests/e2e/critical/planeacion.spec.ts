import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockPlaneacionExtractionApis, mockPlaneacionPendientesApis } from '../utils/planeacion-mocks'

test('extracción IA: pega texto, valida y crea cotizaciones', async ({ page }) => {
  await mockPlaneacionExtractionApis(page)
  await login(page, '/planeacion')

  await page.locator('textarea[placeholder*="Pega aquí"]').fill('8 abril CDMX, Aragón Fes Aragón')
  await page.getByRole('button', { name: 'Extraer Información' }).click()

  await page.locator('input[placeholder="Busca o escribe cliente..."]').fill('Estudio Manantial')
  await page.getByRole('button', { name: 'Continuar →' }).click()

  await expect(page.getByText('✅ CONFIRMADOS (1)')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: /Crear 1 cotización/ }).click()

  await expect(page.getByText('Cotizaciones a crear')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar y Crear' }).click()

  // Nota: el mensaje "✓ N cotizaciones creadas" se guarda en state.error pero
  // el paso vuelve a 'project' en el mismo setState, y ProjectSelector no
  // renderiza `error` -- el mensaje nunca es visible en pantalla (hallazgo,
  // ver resumen). Verificamos el resultado real: el redirect a /cotizaciones.
  await expect(page).toHaveURL(/\/cotizaciones$/, { timeout: 5000 })
})

test('pendientes: edita una fila y confirma creación de cotización', async ({ page }) => {
  await mockPlaneacionPendientesApis(page)
  await login(page, '/planeacion/pendientes')

  const row = page.locator('table tbody tr').first()
  await expect(row.locator('input').nth(1)).toHaveValue('2026-05-20')

  await row.locator('select').nth(1).selectOption('confirmado')

  await page.getByRole('button', { name: 'Revisar Cambios →' }).click()
  await expect(page.getByText('Detalle de pendientes:')).toBeVisible()

  await page.getByRole('button', { name: 'Confirmar y Crear' }).click()
  await expect(page.getByText(/cotizaciones creadas/)).toBeVisible()
})
