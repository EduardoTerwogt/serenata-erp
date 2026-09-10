import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCotizacionDetailApis } from '../utils/quotation-detail-mocks'
import { mockRealtimeChannel } from '../utils/realtime-mock'
import { fulfillJson } from '../utils/http'

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

test('seleccionar una sugerencia de producto autocompleta categoría, precio y x_pagar', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-PRODUCTO',
    estado: 'BORRADOR',
    productos: [
      { id: 'prod-1', descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar_sugerido: 12000, activo: true, created_at: '2026-01-01' },
    ],
  })
  await login(page, '/cotizaciones/SH-E2E-PRODUCTO')
  await expect(page.getByRole('heading', { name: 'SH-E2E-PRODUCTO' })).toBeVisible()

  const firstRow = page.locator('table tbody tr').first()
  const descripcion = firstRow.locator('td').nth(1).locator('input')
  // El dropdown de sugerencias es position:fixed, anclado justo debajo del input: si la
  // fila queda al ras del borde inferior del viewport, el dropdown se pinta fuera de
  // pantalla y Playwright nunca puede hacerle click. Centrar la fila deja espacio abajo.
  await descripcion.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await descripcion.fill('grúa Techno')

  const [request] = await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH' && 'categoria' in (req.postDataJSON() || {})),
    page.getByText('Renta de grúa Technocrane').click(),
  ])
  const patch = request.postDataJSON()
  expect(patch.descripcion).toBe('Renta de grúa Technocrane')
  expect(patch.categoria).toBe('Grip')
  expect(patch.precio_unitario).toBe(25000)
  expect(patch.x_pagar).toBe(12000)

  await expect(descripcion).toHaveValue('Renta de grúa Technocrane')
  await expect(firstRow.locator('td').nth(0).locator('input')).toHaveValue('Grip')
  await expect(firstRow.locator('td').nth(3).locator('input')).toHaveValue('25000')
  await expect(firstRow.locator('td').nth(6).locator('input')).toHaveValue('12000')
})

test('cambiar el responsable de una partida persiste el cambio', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-RESPONSABLE',
    estado: 'BORRADOR',
    responsables: [
      { id: 'resp-1', nombre: 'Sofía Ramírez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Camarógrafa'], notas: null, activo: true, created_at: '2026-01-01' },
      { id: 'resp-2', nombre: 'Juan Pérez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Gaffer'], notas: null, activo: true, created_at: '2026-01-01' },
    ],
  })
  await login(page, '/cotizaciones/SH-E2E-RESPONSABLE')
  await expect(page.getByRole('heading', { name: 'SH-E2E-RESPONSABLE' })).toBeVisible()

  const firstRow = page.locator('table tbody tr').first()
  const responsableSelect = firstRow.locator('td').nth(5).locator('select')
  await expect(responsableSelect).toHaveValue('resp-1')

  const [request] = await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH' && 'responsable_id' in (req.postDataJSON() || {})),
    responsableSelect.selectOption('resp-2'),
  ])

  const patch = request.postDataJSON()
  expect(patch.responsable_id).toBe('resp-2')
  expect(patch.responsable_nombre).toBe('Juan Pérez')
  await expect(responsableSelect).toHaveValue('resp-2')
})

test('copiar partidas seleccionadas desde otra cotización las trae a la actual', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-COPIAR', estado: 'BORRADOR' })
  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() !== 'GET') { await route.fallback(); return }
    await fulfillJson(route, [
      {
        id: 'SH-OTRA',
        cliente: 'Otro Cliente',
        proyecto: 'Otro Proyecto',
        estado: 'EMITIDA',
        items: [
          { id: 'otra-item-1', cotizacion_id: 'SH-OTRA', categoria: 'Audio', descripcion: 'Boom más micrófono', cantidad: 1, precio_unitario: 5000, importe: 5000, responsable_nombre: null, responsable_id: null, x_pagar: 2000, margen: 3000, orden: 1, notas: null },
        ],
      },
    ])
  })
  await login(page, '/cotizaciones/SH-E2E-COPIAR')
  await expect(page.getByRole('heading', { name: 'SH-E2E-COPIAR' })).toBeVisible()

  await page.getByRole('button', { name: /Copiar desde otra cotización/ }).click()
  await page.getByText('SH-OTRA').click()
  await page.getByLabel(/Boom más micrófono/).click()

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/items/bulk') && req.method() === 'POST'),
    page.getByRole('button', { name: /Traer a cotización actual/ }).click(),
  ])
  const body = request.postDataJSON()
  expect(body.items).toHaveLength(1)
  expect(body.items[0].descripcion).toBe('Boom más micrófono')

  // La partida original no estaba en blanco, así que la copiada se agrega al final.
  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Boom más micrófono')
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

  const bulkRequests: Record<string, unknown>[] = []
  page.on('request', (req) => {
    if (req.url().endsWith('/items/bulk') && req.method() === 'POST') {
      bulkRequests.push(req.postDataJSON() || {})
    }
  })

  await page.locator('select').filter({ hasText: 'Plantilla de servicios' }).selectOption('tpl-1')

  // Dos partidas de plantilla sobre una fila en blanco = 2 filas, no 3.
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).locator('td').nth(1).locator('input')).toHaveValue('Cámara')
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Iluminación')

  // Quedaron persistidas en el servidor (el bug original solo las agregaba en memoria)
  // y la fila en blanco se mandó para reutilizarla, no para crear una de más.
  await expect.poll(() => bulkRequests.length).toBe(1)
  expect((bulkRequests[0].items as Record<string, unknown>[]).map((i) => i.descripcion)).toEqual(['Cámara', 'Iluminación'])
  expect(bulkRequests[0].reemplazar_ids).toEqual(['item-blank-1'])
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

// Regresión del flujo que reportó Eduardo: agregar filas, borrar varias seguidas y
// aplicar una plantilla dejaba filas vacías imposibles de borrar (el índice del
// render caducaba y `useFieldArray.remove` operaba sobre un snapshot viejo).
test('borrar dos filas seguidas rápido no deja filas fantasma', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-RAFAGA', estado: 'BORRADOR', itemLatencyMs: 200 })
  await login(page, '/cotizaciones/SH-E2E-RAFAGA')
  await expect(page.getByRole('heading', { name: 'SH-E2E-RAFAGA' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  const addRow = page.getByRole('button', { name: /Agregar fila/ })

  for (let i = 0; i < 2; i++) {
    await addRow.click()
    await expect(rows).toHaveCount(i + 2)
  }

  const deleted: string[] = []
  page.on('request', (req) => {
    if (/\/items\/([^/]+)$/.test(req.url()) && req.method() === 'DELETE') {
      deleted.push(req.url().split('/').pop() as string)
    }
  })

  // Dos clics sin esperar al repintado, como un usuario real.
  await rows.nth(2).locator('td').last().locator('button').click()
  await rows.nth(1).locator('td').last().locator('button').click()

  await expect(rows).toHaveCount(1)
  await expect(rows.nth(0).locator('td').nth(1).locator('input')).toHaveValue('Renta de cámara')
  // Se borraron dos filas distintas, no dos veces la misma.
  await expect.poll(() => new Set(deleted).size).toBe(2)
})

test('el flujo completo reportado deja la tabla consistente y sin filas vacías', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-FLUJO',
    estado: 'BORRADOR',
    itemLatencyMs: 150,
    templates: [{
      id: 'tpl-1', nombre: 'Paquete básico', descripcion: null, activo: true,
      items: [
        { categoria: 'Producción', descripcion: 'Cámara ARRI', cantidad: 1, precio_unitario: 12000, x_pagar: 5000 },
        { categoria: 'Producción', descripcion: 'Iluminación', cantidad: 2, precio_unitario: 4000, x_pagar: 1500 },
      ],
    }],
  })
  await login(page, '/cotizaciones/SH-E2E-FLUJO')
  await expect(page.getByRole('heading', { name: 'SH-E2E-FLUJO' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  const addRow = page.getByRole('button', { name: /Agregar fila/ })

  await addRow.click()
  await expect(rows).toHaveCount(2)
  await addRow.click()
  await expect(rows).toHaveCount(3)

  await rows.nth(2).locator('td').last().locator('button').click()
  await rows.nth(1).locator('td').last().locator('button').click()
  await expect(rows).toHaveCount(1)

  await page.locator('select').filter({ hasText: 'Plantilla de servicios' }).selectOption('tpl-1')
  await expect(rows).toHaveCount(3)

  const descripciones = await rows.locator('td:nth-child(2) input').evaluateAll(
    (els) => els.map((el) => (el as HTMLInputElement).value)
  )
  expect(descripciones).toEqual(['Renta de cámara', 'Cámara ARRI', 'Iluminación'])

  // Y todas siguen siendo borrables: ninguna fila quedó huérfana.
  for (const esperado of [2, 1, 0]) {
    await rows.last().locator('td').last().locator('button').click()
    await expect(rows).toHaveCount(esperado)
  }
})

test('si el DELETE falla, la sección se resincroniza y la fila vuelve a su lugar', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-DELFAIL', estado: 'BORRADOR', failItemDelete: true })
  await login(page, '/cotizaciones/SH-E2E-DELFAIL')
  await expect(page.getByRole('heading', { name: 'SH-E2E-DELFAIL' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  await page.getByRole('button', { name: /Agregar fila/ }).click()
  await expect(rows).toHaveCount(2)

  await rows.nth(0).locator('td').last().locator('button').click()

  await expect(page.getByText('Error eliminando partida')).toBeVisible()
  await expect(rows).toHaveCount(2)
  // Vuelve a su posición original, no al final.
  await expect(rows.nth(0).locator('td').nth(1).locator('input')).toHaveValue('Renta de cámara')
})

// Regresión de los tres síntomas al importar en una cotización existente: subtotal
// que omitía una fila, importación fila por fila y alta lenta.
test('importar una plantilla deja el subtotal correcto sin recargar y en una sola petición', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-BULK',
    estado: 'BORRADOR',
    itemLatencyMs: 150,
    items: [],
    templates: [{
      id: 'tpl-1', nombre: 'Paquete completo', descripcion: null, activo: true,
      items: [
        { categoria: 'Producción', descripcion: 'Cámara ARRI', cantidad: 1, precio_unitario: 12000, x_pagar: 5000 },
        { categoria: 'Producción', descripcion: 'Iluminación', cantidad: 2, precio_unitario: 4000, x_pagar: 1500 },
        { categoria: 'Arte', descripcion: 'Utilería', cantidad: 3, precio_unitario: 1500, x_pagar: 600 },
      ],
    }],
  })
  await login(page, '/cotizaciones/SH-E2E-BULK')
  await expect(page.getByRole('heading', { name: 'SH-E2E-BULK' })).toBeVisible()

  const creaciones: string[] = []
  page.on('request', (req) => {
    if (req.method() !== 'POST') return
    if (req.url().endsWith('/items/bulk')) creaciones.push('bulk')
    else if (req.url().endsWith('/items')) creaciones.push('individual')
  })

  await page.locator('select').filter({ hasText: 'Plantilla de servicios' }).selectOption('tpl-1')
  await expect(page.locator('table tbody tr')).toHaveCount(3)

  // 12000 + 2*4000 + 3*1500 = 24500. Antes la última fila aportaba 0.
  await expect(page.getByText('$24,500.00').first()).toBeVisible()

  // Una sola petición de creación, no una por fila.
  expect(creaciones).toEqual(['bulk'])
})

test('agregar una fila la pinta antes de que responda el servidor', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-OPTIMISTA', estado: 'BORRADOR', itemLatencyMs: 1500 })
  await login(page, '/cotizaciones/SH-E2E-OPTIMISTA')
  await expect(page.getByRole('heading', { name: 'SH-E2E-OPTIMISTA' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(1)

  const inicio = Date.now()
  await page.getByRole('button', { name: /Agregar fila/ }).click()
  await expect(rows).toHaveCount(2)
  // Aparece muy por debajo de los 1500 ms que tarda el POST.
  expect(Date.now() - inicio).toBeLessThan(1000)

  // Y editarla antes de que llegue el id real guarda igual, contra el id definitivo.
  const nuevaDescripcion = rows.nth(1).locator('td').nth(1).locator('input')
  await nuevaDescripcion.fill('Escrito antes del id')
  const [patch] = await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
    nuevaDescripcion.blur(),
  ])
  expect(patch.url()).not.toContain('temp:')
  expect(patch.postDataJSON().descripcion).toBe('Escrito antes del id')
})

// ==================== Colaboración ====================
// Regresión de la carrera que borraba montos: la señal de "otro guardó partidas"
// disparaba una relectura completa que viajaba con una foto anterior al guardado
// local y, al volver, escribía el valor viejo encima.
test('un guardado de otro colaborador no borra el monto recién capturado', async ({ page }) => {
  const cotizacion = await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-COLAB',
    estado: 'BORRADOR',
    detailLatencyMs: 1200,
  })
  const realtime = await mockRealtimeChannel(page)
  await login(page, '/cotizaciones/SH-E2E-COLAB')
  await expect(page.getByRole('heading', { name: 'SH-E2E-COLAB' })).toBeVisible()
  await realtime.esperarConexion()

  const precio = page.locator('table tbody tr').first().locator('td').nth(3).locator('input')
  await precio.fill('9000')

  const [patch] = await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
    precio.blur(),
  ])
  expect(patch.postDataJSON().precio_unitario).toBe(9000)

  // El otro colaborador guarda justo ahora.
  await realtime.emit('section_saved', { section: 'partidas' })
  await page.waitForTimeout(2500)

  await expect(precio).toHaveValue('9000')
  expect(cotizacion.items[0].precio_unitario).toBe(9000)
})

test('un guardado ajeno no provoca una relectura de la cotización', async ({ page }) => {
  const cotizacion = await mockCotizacionDetailApis(page, { id: 'SH-E2E-SINGET', estado: 'BORRADOR' })
  const realtime = await mockRealtimeChannel(page)
  await login(page, '/cotizaciones/SH-E2E-SINGET')
  await expect(page.getByRole('heading', { name: 'SH-E2E-SINGET' })).toBeVisible()
  await page.waitForTimeout(300)

  const antes = (cotizacion as unknown as { __getsDeCotizacion: number }).__getsDeCotizacion
  await realtime.emit('section_saved', { section: 'partidas' })
  await page.waitForTimeout(1200)

  // El cambio ajeno llega por la mutación, no releyendo toda la cotización.
  expect((cotizacion as unknown as { __getsDeCotizacion: number }).__getsDeCotizacion).toBe(antes)
})

test('la fila que agrega otro aparece sin quitarme el foco de donde escribo', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-FOCO', estado: 'BORRADOR' })
  const realtime = await mockRealtimeChannel(page)
  await login(page, '/cotizaciones/SH-E2E-FOCO')
  await expect(page.getByRole('heading', { name: 'SH-E2E-FOCO' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  const descripcion = rows.first().locator('td').nth(1).locator('input')
  await descripcion.click()
  await descripcion.fill('Estoy escribiendo aquí')

  await realtime.emit('item_mutation', {
    action: 'upsert',
    row_id: 'item-remota-1',
    item: {
      id: 'item-remota-1', cotizacion_id: 'SH-E2E-FOCO', categoria: 'Arte', descripcion: 'Partida del otro',
      cantidad: 1, precio_unitario: 3000, importe: 3000, responsable_nombre: null, responsable_id: null,
      x_pagar: 1000, margen: 2000, orden: 2, notas: null,
    },
  })

  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Partida del otro')
  // Ni se pierde el foco ni se pisa lo que estaba escribiendo.
  await expect(descripcion).toBeFocused()
  await expect(descripcion).toHaveValue('Estoy escribiendo aquí')
})

test('escribir en Datos generales mientras otro está en la sección sí guarda', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-SECCION', estado: 'BORRADOR' })
  const realtime = await mockRealtimeChannel(page)
  await login(page, '/cotizaciones/SH-E2E-SECCION')
  await expect(page.getByRole('heading', { name: 'SH-E2E-SECCION' })).toBeVisible()

  // El otro colaborador entra a Datos generales. (No se afirma sobre el aviso visual:
  // llega por presencia y su momento es variable; lo que fija este test es que la
  // presencia ajena ya no deja el campo en solo lectura ni detiene el autoguardado.)
  await realtime.emit('section_signal', { status: 'editing', section: 'general' })
  await page.waitForTimeout(300)

  // El campo sigue siendo editable y lo que escriba se guarda.
  const proyecto = page.locator('input[placeholder="Nombre del proyecto"]')
  await expect(proyecto).toBeEditable()
  await proyecto.fill('Editado pese a la presencia ajena')

  const [request] = await Promise.all([
    page.waitForRequest((req) => req.url().includes('/general') && req.method() === 'PATCH'),
    page.locator('textarea[placeholder="Sin notas..."]').click(),
  ])
  expect(request.postDataJSON().proyecto).toBe('Editado pese a la presencia ajena')
})

/**
 * La fila ajena que llega por RECONCILIACIÓN (sin aviso por el canal) tampoco puede
 * quitarte el cursor. Reconstruir la tabla entera para insertarla remonta los inputs
 * y te lo quita: es la misma molestia que este módulo ya había arreglado para el
 * camino del aviso, y la reconciliación la reintrodujo hasta que se corrigió.
 */
test('la fila que llega por reconciliación no me quita el cursor', async ({ page }) => {
  const cotizacion = await mockCotizacionDetailApis(page, { id: 'SH-E2E-RECON', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-RECON')
  await expect(page.getByRole('heading', { name: 'SH-E2E-RECON' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  const descripcion = rows.first().locator('td').nth(1).locator('input')
  await descripcion.click()
  await descripcion.fill('Estoy escribiendo aquí')

  // Otro colaborador agregó una partida. No se emite ningún aviso: la pantalla debe
  // enterarse sola al reconciliar contra el servidor.
  cotizacion.items = [...cotizacion.items, {
    id: 'item-por-reconciliacion',
    cotizacion_id: 'SH-E2E-RECON',
    categoria: 'Arte',
    descripcion: 'Partida del otro',
    cantidad: 1,
    precio_unitario: 3000,
    importe: 3000,
    responsable_nombre: null,
    responsable_id: null,
    x_pagar: 1000,
    margen: 2000,
    orden: 2,
    notas: null,
  }]

  await expect(rows).toHaveCount(2, { timeout: 20_000 })
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Partida del otro')
  await expect(descripcion).toBeFocused()
  await expect(descripcion).toHaveValue('Estoy escribiendo aquí')
})

/**
 * Gemelo del anterior, para el otro sentido: una partida que DESAPARECE del servidor
 * -otro colaborador la borró- tiene que desaparecer sola de la pantalla, sin aviso
 * por el canal y sin tocar lo que el usuario está escribiendo en otra fila.
 */
test('la fila que borra el otro desaparece por reconciliación', async ({ page }) => {
  const cotizacion = await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-RECON-DEL',
    estado: 'BORRADOR',
    items: [
      {
        id: 'item-que-se-queda', cotizacion_id: 'SH-E2E-RECON-DEL', categoria: 'Producción',
        descripcion: 'Renta de cámara', cantidad: 1, precio_unitario: 15000, importe: 15000,
        responsable_nombre: null, responsable_id: null, x_pagar: 6000, margen: 9000, orden: 0, notas: null,
      },
      {
        id: 'item-que-borra-el-otro', cotizacion_id: 'SH-E2E-RECON-DEL', categoria: 'Arte',
        descripcion: 'Partida del otro', cantidad: 1, precio_unitario: 3000, importe: 3000,
        responsable_nombre: null, responsable_id: null, x_pagar: 1000, margen: 2000, orden: 1, notas: null,
      },
    ],
  })
  await login(page, '/cotizaciones/SH-E2E-RECON-DEL')
  await expect(page.getByRole('heading', { name: 'SH-E2E-RECON-DEL' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(2)

  const descripcion = rows.first().locator('td').nth(1).locator('input')
  await descripcion.click()
  await descripcion.fill('Estoy escribiendo aquí')

  // El otro colaborador borró la segunda partida. Ningún aviso: la pantalla debe
  // enterarse sola.
  cotizacion.items = cotizacion.items.filter((item) => item.id !== 'item-que-borra-el-otro')

  await expect(rows).toHaveCount(1, { timeout: 20_000 })
  await expect(descripcion).toHaveValue('Estoy escribiendo aquí')
  await expect(descripcion).toBeFocused()
})
