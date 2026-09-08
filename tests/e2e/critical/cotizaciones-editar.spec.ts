import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCotizacionDetailApis } from '../utils/quotation-detail-mocks'

test('edita información general de una cotización en BORRADOR (autosave)', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-EDITAR', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-EDITAR')

  await expect(page.getByRole('heading', { name: 'SH-E2E-EDITAR' })).toBeVisible()

  const proyectoInput = page.locator('input[placeholder="Nombre del proyecto"]')
  await proyectoInput.fill('Spot Verano Editado E2E')

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/general') && req.method() === 'PATCH'),
    page.locator('textarea[placeholder="Sin notas..."]').click(),
  ])

  expect(request.postDataJSON().proyecto).toBe('Spot Verano Editado E2E')
  await expect(proyectoInput).toHaveValue('Spot Verano Editado E2E')
})

test('autoguarda fecha de entrega y locación (sección general)', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-GENERAL', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-GENERAL')
  await expect(page.getByRole('heading', { name: 'SH-E2E-GENERAL' })).toBeVisible()

  const locacionInput = page.locator('input[placeholder="Lugar del evento"]')
  await locacionInput.fill('Guadalajara')

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/general') && req.method() === 'PATCH'),
    page.locator('textarea[placeholder="Sin notas..."]').click(),
  ])

  expect(request.postDataJSON().locacion).toBe('Guadalajara')
})

test('autoguarda las notas internas', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-NOTAS', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-NOTAS')
  await expect(page.getByRole('heading', { name: 'SH-E2E-NOTAS' })).toBeVisible()

  const notas = page.locator('textarea[placeholder="Sin notas..."]')
  await notas.fill('Llamado 6am, dos unidades')

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/notas') && req.method() === 'PATCH'),
    page.locator('input[placeholder="Nombre del proyecto"]').click(),
  ])

  expect(request.postDataJSON().notas_internas).toBe('Llamado 6am, dos unidades')
})

test('autoguarda cada celda de una partida sin pisar lo que se sigue escribiendo', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-CELDAS', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-CELDAS')
  await expect(page.getByRole('heading', { name: 'SH-E2E-CELDAS' })).toBeVisible()

  const firstRow = page.locator('table tbody tr').first()
  const descripcion = firstRow.locator('td').nth(1).locator('input')

  await descripcion.fill('Renta de cámara ARRI')
  const [descRequest] = await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
    expect(descripcion).toHaveValue('Renta de cámara ARRI'),
  ])
  expect(descRequest.postDataJSON().descripcion).toBe('Renta de cámara ARRI')

  // Escribir la descripción no debe borrar el precio ya capturado.
  await expect(firstRow.locator('td').nth(3).locator('input')).toHaveValue('15000')

  // La respuesta del PATCH no debe revertir el valor visible.
  await expect(descripcion).toHaveValue('Renta de cámara ARRI')

  const cantidad = firstRow.locator('td').nth(2).locator('input')
  await cantidad.fill('3')
  const [cantRequest] = await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH' && 'cantidad' in (req.postDataJSON() || {})),
    cantidad.blur(),
  ])
  expect(cantRequest.postDataJSON().cantidad).toBe(3)

  const xPagar = firstRow.locator('td').nth(6).locator('input')
  await xPagar.fill('7500')
  const [pagarRequest] = await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH' && 'x_pagar' in (req.postDataJSON() || {})),
    xPagar.blur(),
  ])
  expect(pagarRequest.postDataJSON().x_pagar).toBe(7500)
})

test('agregar y borrar una partida responde de inmediato', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-FILAS', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-FILAS')
  await expect(page.getByRole('heading', { name: 'SH-E2E-FILAS' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(1)

  await Promise.all([
    page.waitForRequest((req) => req.url().endsWith('/items') && req.method() === 'POST'),
    page.getByRole('button', { name: /Agregar fila/ }).click(),
  ])
  await expect(rows).toHaveCount(2)

  // La fila recién creada NO debe quedar bloqueada: su ✕ está disponible al instante.
  const deleteNewRow = rows.nth(1).locator('td').last().locator('button')
  await expect(deleteNewRow).toBeEnabled()

  await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'DELETE'),
    deleteNewRow.click(),
  ])
  await expect(rows).toHaveCount(1)
})

test('aplicar una plantilla persiste las partidas y reusa la fila en blanco', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-PLANTILLA',
    estado: 'BORRADOR',
    items: [
      {
        id: 'item-blank-1',
        cotizacion_id: 'SH-E2E-PLANTILLA',
        categoria: '',
        descripcion: '',
        cantidad: 1,
        precio_unitario: 0,
        importe: 0,
        responsable_nombre: null,
        responsable_id: null,
        x_pagar: 0,
        margen: 0,
        orden: 1,
        notas: null,
      },
    ],
    templates: [
      {
        id: 'tpl-1',
        nombre: 'Paquete básico',
        descripcion: null,
        activo: true,
        items: [
          { categoria: 'Producción', descripcion: 'Cámara', cantidad: 1, precio_unitario: 10000, x_pagar: 4000 },
          { categoria: 'Producción', descripcion: 'Iluminación', cantidad: 1, precio_unitario: 5000, x_pagar: 2000 },
        ],
      },
    ],
  })
  await login(page, '/cotizaciones/SH-E2E-PLANTILLA')
  await expect(page.getByRole('heading', { name: 'SH-E2E-PLANTILLA' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(1)

  const patchRequests: Record<string, unknown>[] = []
  page.on('request', (req) => {
    if (/\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH') {
      patchRequests.push(req.postDataJSON() || {})
    }
  })

  await page.locator('select').filter({ hasText: 'Plantilla de servicios' }).selectOption('tpl-1')

  // Dos partidas de plantilla sobre una fila en blanco = 2 filas, no 3.
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).locator('td').nth(1).locator('input')).toHaveValue('Cámara')
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Iluminación')

  // Y quedaron persistidas en el servidor (el bug anterior solo las agregaba en memoria).
  await expect.poll(() => patchRequests.map((body) => body.descripcion)).toEqual(['Cámara', 'Iluminación'])
})

test('autoguarda la configuración de totales (fee y descuento)', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-TOTALES', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-TOTALES')
  await expect(page.getByRole('heading', { name: 'SH-E2E-TOTALES' })).toBeVisible()

  const feeInput = page.locator('input[type="number"][max="100"]')
  await feeInput.fill('20')

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/totales') && req.method() === 'PATCH'),
    feeInput.blur(),
  ])

  expect(request.postDataJSON().porcentaje_fee).toBeCloseTo(0.2, 5)
})
