import { test, expect } from '@playwright/test'
import { mockPortalDocumentosConBorrado } from '../utils/portal-mocks'

// Punto 3 (2026-09-20): "Mis documentos" dejaba subir otro documento pero
// nunca borrar uno ya subido.
test('borrar un documento pendiente: pide confirmación y desaparece de la lista', async ({ page }) => {
  await mockPortalDocumentosConBorrado(page)
  await page.goto('/portal')
  await page.getByRole('button', { name: 'Documentación' }).click()

  await expect(page.getByText('ine.jpg')).toBeVisible()

  await page.getByRole('button', { name: 'Borrar INE' }).click()
  await expect(page.getByText('Se borra "ine.jpg" por completo', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Sí, borrar' }).click()

  await expect(page.getByText('ine.jpg')).not.toBeVisible()
  await expect(page.getByText('Sin documento subido').first()).toBeVisible()
})

test('un documento ya validado no ofrece botón de borrar', async ({ page }) => {
  await mockPortalDocumentosConBorrado(page)
  await page.goto('/portal')
  await page.getByRole('button', { name: 'Documentación' }).click()

  await expect(page.getByText('constancia.pdf')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Borrar Constancia de situación fiscal' })).toHaveCount(0)
})

test('cancelar el borrado ("Mantener") no borra el documento', async ({ page }) => {
  await mockPortalDocumentosConBorrado(page)
  await page.goto('/portal')
  await page.getByRole('button', { name: 'Documentación' }).click()

  await page.getByRole('button', { name: 'Borrar INE' }).click()
  await page.getByRole('button', { name: 'Mantener' }).click()

  await expect(page.getByText('ine.jpg')).toBeVisible()
})
