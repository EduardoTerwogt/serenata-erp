import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockNuevaCotizacionApis } from '../utils/quotation-mocks'
import { fulfillJson } from '../utils/http'

test('crea una cotización nueva en BORRADOR', async ({ page }) => {
  await mockNuevaCotizacionApis(page)

  const draftPosts: Record<string, unknown>[] = []
  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, [])
      return
    }
    draftPosts.push((route.request().postDataJSON() || {}) as Record<string, unknown>)
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

  // Sin botón de guardar: el borrador se crea solo (proyecto + partida con
  // descripción) y la pantalla se queda en /nueva con el folio ya reservado.
  await expect.poll(() => draftPosts.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(draftPosts[0].estado).toBe('BORRADOR')
  expect(draftPosts[0].proyecto).toBe('Show Monterrey')

  await expect(page.getByText('Borrador guardado')).toBeVisible()
  await expect(page).toHaveURL(/\/cotizaciones\/nueva/)
  await expect(page.getByText('SH-E2E-CREAR')).toBeVisible()
})

test('no guarda nada hasta que hay proyecto y una partida con descripción', async ({ page }) => {
  await mockNuevaCotizacionApis(page)

  let postCount = 0
  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, [])
      return
    }
    postCount += 1
    await fulfillJson(route, { id: 'SH-E2E-NOGUARDA', estado: 'BORRADOR', items: [] })
  })

  await login(page, '/cotizaciones/nueva')

  // Solo proyecto, sin partidas con descripción: no debe guardar.
  await page.locator('input[placeholder="Nombre del proyecto"]').fill('Show sin partidas')
  await page.waitForTimeout(2000)
  expect(postCount).toBe(0)

  // Solo partida, sin nombre de proyecto: tampoco.
  await page.locator('input[placeholder="Nombre del proyecto"]').fill('')
  await page.locator('table tbody tr').first().locator('td').nth(1).locator('input').fill('Backline')
  await page.waitForTimeout(2000)
  expect(postCount).toBe(0)
})
