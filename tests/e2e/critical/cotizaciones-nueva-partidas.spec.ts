import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockNuevaCotizacionApis, assertPayloadValido } from '../utils/quotation-mocks'
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

// ==================== Autoguardado del borrador ====================

test('la pantalla quieta guarda UNA vez, no una por segundo', async ({ page }) => {
  await mockNuevaCotizacionApis(page)
  const guardados: string[] = []
  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() !== 'POST') return fulfillJson(route, [])
    // Se valida con el schema real: un payload que producción rechazaría falla aquí.
    assertPayloadValido(route.request().postDataJSON(), 'POST /api/cotizaciones')
    guardados.push('POST')
    await fulfillJson(route, { id: 'SH-E2E-LOOP', estado: 'BORRADOR', items: [{ id: 'i1' }] })
  })
  await page.route('**/api/cotizaciones/SH-E2E-LOOP', async (route) => {
    if (route.request().method() === 'PUT') {
      assertPayloadValido(route.request().postDataJSON(), 'PUT /api/cotizaciones/:id')
      guardados.push('PUT')
    }
    await fulfillJson(route, { id: 'SH-E2E-LOOP', estado: 'BORRADOR', items: [{ id: 'i1' }] })
  })

  await login(page, '/cotizaciones/nueva')
  await expect(page.getByRole('heading', { name: 'Nueva Cotizacion' })).toBeVisible()

  await page.locator('input[placeholder="Nombre del cliente"]').fill('Walmart México')
  await page.locator('input[placeholder="Nombre del proyecto"]').fill('Show Monterrey')
  await page.locator('table tbody tr').first().locator('td').nth(1).locator('input').fill('Backline')

  await expect(page.getByText('Borrador guardado')).toBeVisible()
  // Cinco segundos quieto: no debe salir un guardado por segundo.
  await page.waitForTimeout(5000)
  expect(guardados).toEqual(['POST'])
})

test('no intenta guardar sin cliente, porque el servidor lo rechazaría', async ({ page }) => {
  await mockNuevaCotizacionApis(page)
  let intentos = 0
  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() !== 'POST') return fulfillJson(route, [])
    intentos += 1
    assertPayloadValido(route.request().postDataJSON(), 'POST /api/cotizaciones')
    await fulfillJson(route, { id: 'SH-E2E-SINCLI', estado: 'BORRADOR', items: [] })
  })

  await login(page, '/cotizaciones/nueva')
  await page.locator('input[placeholder="Nombre del proyecto"]').fill('Show sin cliente')
  await page.locator('table tbody tr').first().locator('td').nth(1).locator('input').fill('Backline')
  await page.waitForTimeout(3000)

  expect(intentos).toBe(0)
})

test('una fila en blanco no invalida el guardado del borrador', async ({ page }) => {
  await mockNuevaCotizacionApis(page)
  const payloads: Record<string, unknown>[] = []
  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() !== 'POST') return fulfillJson(route, [])
    const body = route.request().postDataJSON()
    assertPayloadValido(body, 'POST /api/cotizaciones')
    payloads.push(body)
    await fulfillJson(route, { id: 'SH-E2E-BLANCA', estado: 'BORRADOR', items: [{ id: 'i1' }] })
  })
  await page.route('**/api/cotizaciones/SH-E2E-BLANCA', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      assertPayloadValido(body, 'PUT /api/cotizaciones/:id')
      payloads.push(body)
    }
    await fulfillJson(route, { id: 'SH-E2E-BLANCA', estado: 'BORRADOR', items: [{ id: 'i1' }] })
  })

  await login(page, '/cotizaciones/nueva')
  await page.locator('input[placeholder="Nombre del cliente"]').fill('Walmart México')
  await page.locator('input[placeholder="Nombre del proyecto"]').fill('Show Monterrey')
  await page.locator('table tbody tr').first().locator('td').nth(1).locator('input').fill('Backline')
  await expect(page.getByText('Borrador guardado')).toBeVisible()

  // Añadir una fila vacía no debe romper el guardado: la fila en blanco no se envía.
  await page.getByRole('button', { name: /Agregar fila/ }).click()
  await page.waitForTimeout(2500)

  await expect(page.getByText('No se pudo guardar el borrador')).toHaveCount(0)
  for (const body of payloads) {
    expect((body.items as { descripcion: string }[]).every((i) => i.descripcion.trim() !== '')).toBe(true)
  }
})
