import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockNuevaCotizacionApis } from '../utils/quotation-mocks'
import { fulfillJson } from '../utils/http'

test('crea una cotización nueva en BORRADOR', async ({ page }) => {
  await mockNuevaCotizacionApis(page)

  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, [])
      return
    }
    await fulfillJson(route, {
      id: 'SH-E2E-CREAR',
      cliente: 'Walmart México',
      proyecto: 'Show Monterrey',
      estado: 'BORRADOR',
      items: [
        { id: 'item-1', cotizacion_id: 'SH-E2E-CREAR', categoria: 'Producción', descripcion: 'Backline', cantidad: 1, precio_unitario: 1000, importe: 1000, responsable_nombre: null, responsable_id: null, x_pagar: 0, margen: 1000, orden: 1, notas: null },
      ],
    })
  })

  await login(page, '/cotizaciones/nueva')

  await page.locator('input[placeholder="Nombre del cliente"]').fill('Walmart México')
  await page.locator('input[placeholder="Nombre del proyecto"]').fill('Show Monterrey')

  const firstRow = page.locator('table tbody tr').first()
  await firstRow.locator('td').nth(1).locator('input').fill('Backline')
  await firstRow.locator('td').nth(3).locator('input').fill('1000')

  await page.getByRole('button', { name: 'Guardar Borrador' }).click()

  await expect(page).toHaveURL(/\/cotizaciones\/SH-E2E-CREAR/)
})
