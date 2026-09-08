import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockNuevaCotizacionApis } from '../utils/quotation-mocks'
import { fulfillJson } from '../utils/http'

const TPL = [
  { categoria: 'Producción', descripcion: 'Cámara ARRI', cantidad: 1, precio_unitario: 12000, x_pagar: 5000 },
  { categoria: 'Producción', descripcion: 'Iluminación', cantidad: 2, precio_unitario: 4000, x_pagar: 1500 },
  { categoria: 'Arte', descripcion: 'Utilería', cantidad: 3, precio_unitario: 1500, x_pagar: 600 },
]

async function abrirNueva(page: Parameters<typeof login>[0]) {
  await mockNuevaCotizacionApis(page)
  await page.route('**/api/service-templates**', (route) =>
    fulfillJson(route, [{ id: 'tpl-1', nombre: 'Paquete', descripcion: null, activo: true, items: TPL }])
  )
  await login(page, '/cotizaciones/nueva')
  await expect(page.getByRole('heading', { name: 'Nueva Cotizacion' })).toBeVisible()
}

const descripciones = (page: Parameters<typeof login>[0]) =>
  page.locator('table tbody tr td:nth-child(2) input').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))

test('borrar todas las filas e importar una plantilla no deja filas vacías', async ({ page }) => {
  await abrirNueva(page)
  const rows = page.locator('table tbody tr')

  // Cargar cuatro partidas a mano.
  await rows.nth(0).locator('td').nth(1).locator('input').fill('Uno')
  for (const nombre of ['Dos', 'Tres', 'Cuatro']) {
    await page.getByRole('button', { name: /Agregar fila/ }).click()
    await rows.last().locator('td').nth(1).locator('input').fill(nombre)
  }
  await expect(rows).toHaveCount(4)

  // Borrarlas todas, incluida la última (antes el ✕ se desactivaba con una sola fila).
  for (const esperado of [3, 2, 1, 0]) {
    await rows.last().locator('td').last().locator('button').click()
    await expect(rows).toHaveCount(esperado)
  }

  await page.locator('select').filter({ hasText: 'Plantilla de servicios' }).selectOption('tpl-1')
  await expect(rows).toHaveCount(TPL.length)
  expect(await descripciones(page)).toEqual(TPL.map((i) => i.descripcion))
})

test('borrar varias filas seguidas rápido no deja filas fantasma', async ({ page }) => {
  await abrirNueva(page)
  const rows = page.locator('table tbody tr')

  await rows.nth(0).locator('td').nth(1).locator('input').fill('Uno')
  for (const nombre of ['Dos', 'Tres']) {
    await page.getByRole('button', { name: /Agregar fila/ }).click()
    await rows.last().locator('td').nth(1).locator('input').fill(nombre)
  }
  await expect(rows).toHaveCount(3)

  // Dos clics sin esperar al repintado.
  await rows.nth(2).locator('td').last().locator('button').click()
  await rows.nth(1).locator('td').last().locator('button').click()

  await expect(rows).toHaveCount(1)
  expect(await descripciones(page)).toEqual(['Uno'])
})

test('importar sobre filas en blanco las reutiliza todas', async ({ page }) => {
  await abrirNueva(page)
  const rows = page.locator('table tbody tr')

  // Tres filas en blanco (la inicial + dos agregadas).
  await page.getByRole('button', { name: /Agregar fila/ }).click()
  await page.getByRole('button', { name: /Agregar fila/ }).click()
  await expect(rows).toHaveCount(3)

  await page.locator('select').filter({ hasText: 'Plantilla de servicios' }).selectOption('tpl-1')

  // Tres en blanco + tres importadas = tres, no seis.
  await expect(rows).toHaveCount(TPL.length)
  expect(await descripciones(page)).toEqual(TPL.map((i) => i.descripcion))
})
