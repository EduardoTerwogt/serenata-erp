import { test, expect } from '@playwright/test'
import { mockPortalDashboard } from '../utils/portal-mocks'

// Bug real (2026-09-19): con regimen_fiscal null, "Mis datos" siempre
// mostraba "Se detecta automáticamente al subir tu constancia de situación
// fiscal" -- un texto genérico que no distinguía si el proveedor ya subió
// su constancia o no. Ahora, mientras no haya régimen detectado, debe
// mandarlo explícitamente a la sección Documentación.
test('régimen fiscal aún no detectado: manda a subir la constancia desde Documentación', async ({ page }) => {
  await mockPortalDashboard(page, { perfil: { regimen_fiscal: null } })

  await page.goto('/portal')

  await expect(page.getByText('Pendiente de subir constancia fiscal, sube desde la sección Documentación')).toBeVisible()
})

test('régimen fiscal ya detectado: se muestra debajo de la etiqueta, sin el texto de "pendiente"', async ({ page }) => {
  await mockPortalDashboard(page, { perfil: { regimen_fiscal: 'fisica' } })

  await page.goto('/portal')

  await expect(page.getByText('Persona física con honorarios')).toBeVisible()
  await expect(page.getByText('Pendiente de subir constancia fiscal', { exact: false })).not.toBeVisible()
})
