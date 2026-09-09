import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasApis } from '../utils/cuentas-mocks'

test('lista de cuentas: toggle Cobrar/Pagar y búsqueda', async ({ page }) => {
  await mockCuentasApis(page)
  await login(page, '/cuentas')

  // Vista "Por proyecto" es la default (Fase 5.3 Bloque 3) -- esta prueba
  // cubre específicamente el toggle Cobrar/Pagar de la vista "Lista".
  await page.getByRole('button', { name: 'Lista' }).click()

  await expect(page.getByRole('cell', { name: 'Walmart México' })).toBeVisible()

  await page.getByRole('button', { name: /^Pagar/i }).click()
  await expect(page.getByRole('cell', { name: 'José García' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Walmart México' })).not.toBeVisible()

  // El buscador es "expandable" (rediseño Apple-style): arranca colapsado
  // en un botón de solo ícono y hay que abrirlo antes de poder escribir.
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.locator('input[placeholder*="Buscar por folio"]').fill('no-existe-xyz')
  await expect(page.getByRole('cell', { name: 'José García' })).not.toBeVisible()
})
