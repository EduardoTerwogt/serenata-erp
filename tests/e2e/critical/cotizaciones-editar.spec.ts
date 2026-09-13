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

  // Fase 8.7: capturar TODOS los PATCH a /items/:id durante el flujo -- ver assert
  // final. Escribir a mano sin blur (como hace el .fill de abajo) deja "descripcion"
  // dirty; elegir la sugerencia antes de que pase el debounce debe producir
  // exactamente un PATCH (el combinado del autofill), nunca uno suelto adicional.
  const itemPatchRequests: Record<string, unknown>[] = []
  page.on('request', (req) => {
    if (/\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH') itemPatchRequests.push(req.postDataJSON())
  })

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
  // Fase 6C: el autofill manda "base" para los 4 campos que toca -- si alguien más
  // ya editó alguno (p. ej. Precio) desde el último valor confirmado, el servidor
  // rechaza la operación completa en vez de pisarlo en silencio.
  expect(Object.keys(patch.base || {}).sort()).toEqual(['categoria', 'descripcion', 'precio_unitario', 'x_pagar'])
  expect(typeof patch.mutation_id).toBe('string')

  await expect(descripcion).toHaveValue('Renta de grúa Technocrane')
  await expect(firstRow.locator('td').nth(0).locator('input')).toHaveValue('Grip')
  await expect(firstRow.locator('td').nth(3).locator('input')).toHaveValue('25000')
  await expect(firstRow.locator('td').nth(6).locator('input')).toHaveValue('12000')

  // Bug preexistente (confirmado con payloads reales de un run de CI): si el click en
  // la sugerencia dispara el blur del input de "descripcion" mientras la celda seguía
  // dirty de la escritura manual, handleItemFieldBlur disparaba su propio PATCH suelto
  // de un solo campo -- corriendo en paralelo al combinado y rompiendo la atomicidad
  // efectiva del autofill (visible en producción como "descripcion" del producto pero
  // "precio_unitario" de otra edición). Esperar más que el debounce de 800ms para
  // descartar también un disparo tardío.
  await page.waitForTimeout(1000)
  expect(itemPatchRequests).toHaveLength(1)
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
  // Fase 6C: manda "base" de responsable_id -- protege contra un cambio de
  // responsable concurrente pisando en silencio lo que otro colaborador ya guardó.
  expect(patch.base).toEqual({ responsable_id: 'resp-1', responsable_nombre: 'Sofía Ramírez' })
  expect(typeof patch.mutation_id).toBe('string')
  await expect(responsableSelect).toHaveValue('resp-2')
})

// Fase 8.7.2 (causa 3 de la auditoría externa): el PATCH de responsable manda
// dos campos (`responsable_id` y `responsable_nombre`, viajan siempre juntos),
// pero antes de este fix el manejo de conflicto solo miraba
// `fields.responsable_id` -- si el 409 real solo traía `responsable_nombre`
// (el id no cambió, pero el nombre denormalizado del proveedor sí), el
// conflicto se descartaba en silencio: ni banner ni forma de resolverlo, y el
// cambio del usuario se perdía sin aviso.
test('conflicto solo en responsable_nombre (el id no chocó) muestra el banner y se resuelve sin corromper el id', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-RESPONSABLE-NOMBRE-CONFLICT',
    estado: 'BORRADOR',
    responsables: [
      { id: 'resp-1', nombre: 'Sofía Ramírez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Camarógrafa'], notas: null, activo: true, created_at: '2026-01-01' },
      { id: 'resp-2', nombre: 'Juan Pérez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Gaffer'], notas: null, activo: true, created_at: '2026-01-01' },
    ],
  })
  await page.route('**/api/cotizaciones/SH-E2E-RESPONSABLE-NOMBRE-CONFLICT/items/*', async (route) => {
    if (route.request().method() !== 'PATCH') { await route.fallback(); return }
    await fulfillJson(route, {
      error: 'conflict',
      entity: 'item_cotizacion',
      id: 'item-detail-1',
      // Nota: `responsable_id` NO aparece en `fields` -- no chocó. Solo el
      // nombre denormalizado, que es justo el caso que se perdía antes.
      fields: { responsable_nombre: { base: 'Sofía Ramírez', current: 'Juan P. (renombrado)', attempted: 'Juan Pérez' } },
    }, 409)
  })
  await login(page, '/cotizaciones/SH-E2E-RESPONSABLE-NOMBRE-CONFLICT')
  await expect(page.getByRole('heading', { name: 'SH-E2E-RESPONSABLE-NOMBRE-CONFLICT' })).toBeVisible()

  const firstRow = page.locator('table tbody tr').first()
  const responsableSelect = firstRow.locator('td').nth(5).locator('select')
  await expect(responsableSelect).toHaveValue('resp-1')

  await responsableSelect.selectOption('resp-2')

  const banner = firstRow.getByText(/Alguien más lo cambió a/)
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Juan P. (renombrado)')

  await firstRow.getByRole('button', { name: /Usar/ }).click()
  await expect(banner).toBeHidden()
  // `patch_item_cotizacion` es atómica: como `responsable_nombre` chocó, la
  // RPC rechazó el PATCH COMPLETO -- `responsable_id` NUNCA se guardó,
  // aunque no aparezca en `fields`. El servidor sigue en `resp-1` (el valor
  // real, nunca cambió); "Usar" debe reflejar EXACTAMENTE eso, no el intento
  // rechazado (`resp-2`).
  await expect(responsableSelect).toHaveValue('resp-1')
})

// Fase 8.7.2 (bloqueador de la 2da ronda de auditoría externa): la misma
// atomicidad aplica al autofill de producto -- descripcion/categoria/
// precio_unitario/x_pagar viajan en un solo PATCH, y si CUALQUIERA choca la
// RPC rechaza los 4. Antes de este fix, "Usar" solo revertía el campo que la
// RPC marcó en conflicto (precio_unitario aquí) y dejaba los otros 3
// mostrando el autofill nunca guardado -- formulario y servidor divergían.
test('conflicto de autofill (solo un campo choca) revierte los 4 campos del grupo al valor real del servidor, no solo el que chocó', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-AUTOFILL-CONFLICT',
    estado: 'BORRADOR',
    productos: [{ id: 'prod-1', descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar_sugerido: 12000, activo: true, created_at: '2026-01-01' }],
  })
  // El item por defecto de mockCotizacionDetailApis (item-detail-1) es
  // { categoria: 'Producción', descripcion: 'Renta de cámara',
  //   precio_unitario: 15000, x_pagar: 6000 } -- ese es el `base` real que
  // buildItemFieldsBase captura antes del autofill, y lo que "el servidor"
  // (el mock, aquí) realmente tiene.
  let patchRecibido: Record<string, unknown> | null = null
  await page.route('**/api/cotizaciones/SH-E2E-AUTOFILL-CONFLICT/items/*', async (route) => {
    if (route.request().method() !== 'PATCH') { await route.fallback(); return }
    patchRecibido = route.request().postDataJSON()
    await fulfillJson(route, {
      error: 'conflict',
      entity: 'item_cotizacion',
      id: 'item-detail-1',
      // Solo `precio_unitario` choca -- otro colaborador ya lo cambió a
      // 18000 antes de este PATCH (base real: 15000, el precio original del
      // item). descripcion/categoria/x_pagar NO aparecen en `fields`: su
      // base coincide con el current real, así que la RPC no los marcó --
      // pero como la operación es atómica, NINGUNO de los 4 se guardó, ni
      // siquiera esos 3.
      fields: { precio_unitario: { base: 15000, current: 18000, attempted: 25000 } },
    }, 409)
  })
  await login(page, '/cotizaciones/SH-E2E-AUTOFILL-CONFLICT')
  await expect(page.getByRole('heading', { name: 'SH-E2E-AUTOFILL-CONFLICT' })).toBeVisible()

  const firstRow = page.locator('table tbody tr').first()
  const descripcion = firstRow.locator('td').nth(1).locator('input')
  const categoria = firstRow.locator('td').nth(0).locator('input')
  const precio = firstRow.locator('td').nth(3).locator('input')
  const xPagar = firstRow.locator('td').nth(6).locator('input')

  await descripcion.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await descripcion.fill('grúa Techno')
  await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
    page.getByText('Renta de grúa Technocrane').click(),
  ])

  // El PATCH que de verdad viajó al "servidor" (el mock) confirma que el
  // intento fue el autofill completo, con `base` correcto -- lo que la RPC
  // rechazó atómicamente.
  await expect.poll(() => patchRecibido).not.toBeNull()
  expect(patchRecibido).toMatchObject({ descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar: 12000, base: { descripcion: 'Renta de cámara', categoria: 'Producción', precio_unitario: 15000, x_pagar: 6000 } })

  const banner = firstRow.getByText(/Alguien más lo cambió a/).first()
  await expect(banner).toBeVisible()

  await firstRow.getByRole('button', { name: /^Usar/ }).first().click()
  await expect(banner).toBeHidden()

  // El PATCH atómico se rechazó completo -- los 4 campos deben quedar en el
  // valor real que "el servidor" (el mock) tiene, nunca en el autofill que
  // nunca se guardó. precio_unitario usa el `current` del conflicto (18000,
  // lo que el otro colaborador puso); descripcion/categoria/x_pagar vuelven
  // a su propio valor real (su base coincidía con el current, la RPC no los
  // marcó), que es exactamente lo que el mock sirvió al cargar la página.
  await expect(descripcion).toHaveValue('Renta de cámara')
  await expect(categoria).toHaveValue('Producción')
  await expect(precio).toHaveValue('18000')
  await expect(xPagar).toHaveValue('6000')
})

// Fase 8.7.2 (2da ronda de auditoría externa): "Mantener" reintenta el PATCH
// atómico completo -- pero antes de este fix, `itemsServerRef` (de donde
// `retryItemGroupPatch` arma la `base` del reintento vía
// `buildItemFieldsBase`) solo se refrescaba al valor real en la rama
// "theirs". En "mine" quedaba con el valor VIEJO, así que el reintento
// mandaba la misma `base` desactualizada y volvía a chocar contra el mismo
// conflicto que se acababa de "resolver".
test('conflicto de autofill: "Mantener" reintenta el PATCH completo con los 4 campos y la base ya corregida', async ({ page }) => {
  await mockCotizacionDetailApis(page, {
    id: 'SH-E2E-AUTOFILL-MANTENER',
    estado: 'BORRADOR',
    productos: [{ id: 'prod-1', descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar_sugerido: 12000, activo: true, created_at: '2026-01-01' }],
  })
  const patchesRecibidos: Record<string, unknown>[] = []
  await page.route('**/api/cotizaciones/SH-E2E-AUTOFILL-MANTENER/items/*', async (route) => {
    if (route.request().method() !== 'PATCH') { await route.fallback(); return }
    const body = route.request().postDataJSON()
    patchesRecibidos.push(body)
    if (patchesRecibidos.length === 1) {
      // Primer intento: precio_unitario choca (otro colaborador ya lo puso
      // en 18000) -- la RPC rechaza los 4 campos completos.
      await fulfillJson(route, {
        error: 'conflict',
        entity: 'item_cotizacion',
        id: 'item-detail-1',
        fields: { precio_unitario: { base: 15000, current: 18000, attempted: 25000 } },
      }, 409)
      return
    }
    // Segundo intento (tras "Mantener"): éxito, confirma los 4 campos con el
    // precio que el usuario eligió mantener (25000, el del producto).
    await fulfillJson(route, {
      item: {
        id: 'item-detail-1', cotizacion_id: 'SH-E2E-AUTOFILL-MANTENER',
        categoria: body.categoria, descripcion: body.descripcion, cantidad: 1,
        precio_unitario: body.precio_unitario, importe: body.precio_unitario,
        responsable_nombre: 'Sofía Ramírez', responsable_id: 'resp-1',
        x_pagar: body.x_pagar, margen: body.precio_unitario - body.x_pagar,
        orden: 1, notas: null,
      },
    })
  })
  await login(page, '/cotizaciones/SH-E2E-AUTOFILL-MANTENER')
  await expect(page.getByRole('heading', { name: 'SH-E2E-AUTOFILL-MANTENER' })).toBeVisible()

  const firstRow = page.locator('table tbody tr').first()
  const descripcion = firstRow.locator('td').nth(1).locator('input')
  await descripcion.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await descripcion.fill('grúa Techno')
  await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
    page.getByText('Renta de grúa Technocrane').click(),
  ])
  await expect.poll(() => patchesRecibidos.length).toBe(1)

  const banner = firstRow.getByText(/Alguien más lo cambió a/).first()
  await expect(banner).toBeVisible()

  await Promise.all([
    page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
    firstRow.getByRole('button', { name: /^Mantener/ }).first().click(),
  ])

  // El reintento debe mandar los 4 campos otra vez (nunca uno solo, o se
  // pierde la atomicidad) y, sobre todo, el `base.precio_unitario` corregido
  // al `current` real que el 409 anterior reveló (18000) -- no el `base`
  // original (15000), que volvería a chocar contra el mismo conflicto.
  await expect.poll(() => patchesRecibidos.length).toBe(2)
  const segundoPatch = patchesRecibidos[1]
  expect(segundoPatch).toMatchObject({ descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar: 12000 })
  expect((segundoPatch.base as Record<string, unknown>).precio_unitario).toBe(18000)

  // Tras el éxito del reintento, ningún conflicto debe quedar visible.
  await expect(banner).toBeHidden()
  await expect(page.getByText(/Alguien más lo cambió a/)).toHaveCount(0)
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
  expect(bulkRequests[0].reemplazar_ids).toEqual([{ id: 'item-blank-1', revision: 0 }])
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
  const [creacion] = await Promise.all([
    page.waitForRequest((req) => req.url().endsWith('/items') && req.method() === 'POST'),
    page.getByRole('button', { name: /Agregar fila/ }).click(),
  ])
  await expect(rows).toHaveCount(2)
  // Aparece muy por debajo de los 1500 ms que tarda el POST.
  expect(Date.now() - inicio).toBeLessThan(1000)

  // Fase 6B: la fila nace con su id definitivo (el que el propio POST manda) --
  // no hay un id provisional que luego cambie.
  const idDefinitivo = creacion.postDataJSON().id as string
  expect(idDefinitivo).toMatch(/^[0-9a-f-]{36}$/i)

  // Editarla antes de que responda el servidor guarda igual, contra ese mismo id:
  // el PATCH espera a que el alta termine (awaitRowCreation) en vez de fallar.
  const nuevaDescripcion = rows.nth(1).locator('td').nth(1).locator('input')
  await nuevaDescripcion.fill('Escrito antes del id')
  const [patch] = await Promise.all([
    page.waitForRequest((req) => req.url().endsWith(`/items/${idDefinitivo}`) && req.method() === 'PATCH'),
    nuevaDescripcion.blur(),
  ])
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

  // El otro colaborador confirma un cambio ajeno justo ahora (item_confirmed,
  // server-confirmed -- Fase 6E retiró el aviso de navegador `section_saved`).
  await realtime.emit('item_confirmed', {
    cotizacion_id: 'SH-E2E-COLAB', item_id: 'item-detail-1', revision: 1, mutation_id: null, operation: 'update',
  })
  await page.waitForTimeout(2500)

  await expect(precio).toHaveValue('9000')
  expect(cotizacion.items[0].precio_unitario).toBe(9000)
})

test('la fila que agrega otro aparece sin quitarme el foco de donde escribo', async ({ page }) => {
  const cotizacion = await mockCotizacionDetailApis(page, { id: 'SH-E2E-FOCO', estado: 'BORRADOR' })
  const realtime = await mockRealtimeChannel(page)
  await login(page, '/cotizaciones/SH-E2E-FOCO')
  await expect(page.getByRole('heading', { name: 'SH-E2E-FOCO' })).toBeVisible()

  const rows = page.locator('table tbody tr')
  const descripcion = rows.first().locator('td').nth(1).locator('input')
  await descripcion.click()
  await descripcion.fill('Estoy escribiendo aquí')

  // Fase 6D: el aviso del navegador (`item_mutation`) ya no existe. El otro
  // colaborador guardó su fila en el servidor (simulado sobre el estado del mock,
  // igual que un GET la vería) y el servidor confirma con `item_confirmed`, que
  // dispara una reconciliación inmediata en vez de esperar el heartbeat, que desde
  // Fase 6E ya no es la garantía primaria.
  cotizacion.items = [...cotizacion.items, {
    id: 'item-remota-1', cotizacion_id: 'SH-E2E-FOCO', categoria: 'Arte', descripcion: 'Partida del otro',
    cantidad: 1, precio_unitario: 3000, importe: 3000, responsable_nombre: null, responsable_id: null,
    x_pagar: 1000, margen: 2000, orden: 2, notas: null,
  }]
  await realtime.emit('item_confirmed', {
    cotizacion_id: 'SH-E2E-FOCO', item_id: 'item-remota-1', revision: 0, mutation_id: null, operation: 'create',
  })

  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Partida del otro')
  // Ni se pierde el foco ni se pisa lo que estaba escribiendo.
  await expect(descripcion).toBeFocused()
  await expect(descripcion).toHaveValue('Estoy escribiendo aquí')
})

// Fase 8 (hardening pre-Proyectos): el evento `item_confirmed` de una importación
// masiva viaja con `item_id: null` (representa varias filas, no una) -- el listener
// lo descartaba antes de llegar al reducer, así que el SEGUNDO navegador (que no
// hizo el import) nunca reconciliaba por esta vía y dependía en silencio del poll de
// 20s. Esta prueba lo demuestra: si el fix no está, falla por timeout esperando las
// filas nuevas mucho antes de que el poll llegara a disparar.
test('un import masivo de otro colaborador (bulk, item_id null) reconcilia sin esperar el poll', async ({ page }) => {
  const cotizacion = await mockCotizacionDetailApis(page, { id: 'SH-E2E-BULK-OTRO', estado: 'BORRADOR' })
  const realtime = await mockRealtimeChannel(page)
  await login(page, '/cotizaciones/SH-E2E-BULK-OTRO')
  await expect(page.getByRole('heading', { name: 'SH-E2E-BULK-OTRO' })).toBeVisible()
  await realtime.esperarConexion()

  const rows = page.locator('table tbody tr')
  const antes = await rows.count()

  // El otro colaborador importó 2 partidas -- el mock simula el estado que un GET
  // vería después de ese bulk import real.
  cotizacion.items = [...cotizacion.items,
    { id: 'item-bulk-1', cotizacion_id: 'SH-E2E-BULK-OTRO', categoria: 'Grip', descripcion: 'Grúa importada por otro', cantidad: 1, precio_unitario: 4000, importe: 4000, responsable_nombre: null, responsable_id: null, x_pagar: 1500, margen: 2500, orden: antes, notas: null },
    { id: 'item-bulk-2', cotizacion_id: 'SH-E2E-BULK-OTRO', categoria: 'Grip', descripcion: 'Dolly importado por otro', cantidad: 1, precio_unitario: 2500, importe: 2500, responsable_nombre: null, responsable_id: null, x_pagar: 900, margen: 1600, orden: antes + 1, notas: null },
  ]
  await realtime.emit('item_confirmed', {
    cotizacion_id: 'SH-E2E-BULK-OTRO', item_id: null, revision: null, mutation_id: null, operation: 'bulk',
  })

  // Bien por debajo de RECONCILIACION_MS (20s): si esto solo convergiera por el
  // poll, la aserción fallaría por timeout mucho antes de que el poll dispare.
  await expect(rows).toHaveCount(antes + 2, { timeout: 5_000 })
  await expect(rows.nth(antes).locator('td').nth(1).locator('input')).toHaveValue('Grúa importada por otro')
  await expect(rows.nth(antes + 1).locator('td').nth(1).locator('input')).toHaveValue('Dolly importado por otro')
})

test('escribir en Datos generales mientras otro está en la sección sí guarda', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-SECCION', estado: 'BORRADOR' })
  const realtime = await mockRealtimeChannel(page)
  await login(page, '/cotizaciones/SH-E2E-SECCION')
  await expect(page.getByRole('heading', { name: 'SH-E2E-SECCION' })).toBeVisible()

  // El otro colaborador entra a Datos generales (Presence real -- Fase 6E, ya no
  // un broadcast `section_signal` aparte). No se afirma sobre el aviso visual: su
  // momento es variable; lo que fija este test es que la presencia ajena ya no deja
  // el campo en solo lectura ni detiene el autoguardado.
  await realtime.emitPresence({ active_section: 'general' })
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
  // Fase 6E: el heartbeat ya no es la garantía primaria y se hizo mucho menos
  // frecuente (RECONCILIACION_MS) -- este test prueba justo esa red de última
  // instancia, sin ningún aviso de por medio, así que necesita más margen.
  test.slow()
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

  await expect(rows).toHaveCount(2, { timeout: 30_000 })
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Partida del otro')
  await expect(descripcion).toBeFocused()
  await expect(descripcion).toHaveValue('Estoy escribiendo aquí')
})

/**
 * Fase 6E: volver a la pestaña es uno de los caminos PRIMARIOS de convergencia
 * (junto a los eventos server-confirmed y reconectar el canal), no solo el
 * heartbeat de última instancia. Sin ningún aviso por el canal, debe converger
 * mucho más rápido que el intervalo del heartbeat con solo volver a la pestaña.
 */
test('volver a la pestaña converge sin esperar el heartbeat', async ({ page }) => {
  const cotizacion = await mockCotizacionDetailApis(page, { id: 'SH-E2E-VISIBLE', estado: 'BORRADOR' })
  await login(page, '/cotizaciones/SH-E2E-VISIBLE')
  await expect(page.getByRole('heading', { name: 'SH-E2E-VISIBLE' })).toBeVisible()

  const rows = page.locator('table tbody tr')

  // Otro colaborador agregó una partida mientras la pestaña estaba oculta. Sin
  // ningún aviso por el canal -- lo mismo que ejercen los dos tests de arriba, pero
  // aquí la convergencia la dispara volver a la pestaña, no el heartbeat.
  cotizacion.items = [...cotizacion.items, {
    id: 'item-tras-volver', cotizacion_id: 'SH-E2E-VISIBLE', categoria: 'Arte', descripcion: 'Partida al volver',
    cantidad: 1, precio_unitario: 3000, importe: 3000, responsable_nombre: null, responsable_id: null,
    x_pagar: 1000, margen: 2000, orden: 2, notas: null,
  }]

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // Converge casi de inmediato -- mucho antes de que el heartbeat (20s) llegara a
  // dispararse por su cuenta.
  await expect(rows).toHaveCount(2, { timeout: 5_000 })
  await expect(rows.nth(1).locator('td').nth(1).locator('input')).toHaveValue('Partida al volver')
})

/**
 * Gemelo del anterior, para el otro sentido: una partida que DESAPARECE del servidor
 * -otro colaborador la borró- tiene que desaparecer sola de la pantalla, sin aviso
 * por el canal y sin tocar lo que el usuario está escribiendo en otra fila.
 */
test('la fila que borra el otro desaparece por reconciliación', async ({ page }) => {
  // Fase 6E: mismo motivo que el gemelo de arriba -- red de última instancia, sin
  // aviso, con un intervalo deliberadamente más largo que antes.
  test.slow()
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

  await expect(rows).toHaveCount(1, { timeout: 30_000 })
  await expect(descripcion).toHaveValue('Estoy escribiendo aquí')
  await expect(descripcion).toBeFocused()
})

// Fase 8 (hardening pre-Proyectos): root cause real de un error visto en logs de
// CI ("cannot add presence callbacks after joining a channel") durante el test
// live que corta el WebSocket -- `RealtimeClient.channel()` (supabase-js real,
// solo el transporte WS está interceptado aquí) reusa el objeto de canal existente
// para el mismo topic si `removeChannel()` (async) no terminó, y `scheduleReconnect`
// llamaba `connect()` sin esperarlo. Cada intento de reconexión abortado a medias
// por esa excepción retrasaba la siguiente ronda. Este test fuerza el mismo
// escenario (WS que nunca responde al join -> TIMED_OUT/CLOSED repetido, varios
// reintentos de backoff en pocos segundos) y confirma que ningún `pageerror` se
// dispara durante ese lapso.
test('el canal caído reconecta en varios intentos sin lanzar errores de lifecycle', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-CANAL-CAIDO', estado: 'BORRADOR' })
  // A diferencia de mockRealtimeChannel (que responde 'ok' al join), aquí el
  // WebSocket no contesta nada -- el mismo truco que usa el test live equivalente
  // para forzar que supabase-js nunca reciba un join exitoso.
  await page.routeWebSocket(/realtime/, () => {})

  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await login(page, '/cotizaciones/SH-E2E-CANAL-CAIDO')
  await expect(page.getByRole('heading', { name: 'SH-E2E-CANAL-CAIDO' })).toBeVisible()

  // Suficiente para varias rondas de backoff (1s/2s/4s/8s) del reconnect real.
  await page.waitForTimeout(12_000)

  // Fase 8.7 (Bloque 2): criterio de cierre es "cero pageerror" en general, no
  // solo ausencia del mensaje puntual que motivó este test originalmente --
  // un retry de trackPresence contra un canal ya retirado también terminaría
  // como pageerror si algo lo dejara escapar sin manejar.
  expect(pageErrors).toEqual([])
})

// Fase 8.7 (Bloque 2): "onDisconnected" (reconexión interna) no limpiaba los
// retries pendientes de trackPresence -- solo "onSessionEnd" (unmount) lo
// hacía. Este test fuerza una caída real de canal (cierre del WebSocket desde
// el servidor simulado) y confirma que, tras reconectar, Presence vuelve a
// funcionar (se ve al otro colaborador) sin ningún pageerror -- el criterio de
// cierre completo del bloque, no solo la ausencia de un mensaje puntual.
test('Presence se recupera tras una caída de canal, sin pageerror', async ({ page }) => {
  await mockCotizacionDetailApis(page, { id: 'SH-E2E-PRESENCE-RECONNECT', estado: 'BORRADOR' })

  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  let intentosDeConexion = 0
  await page.routeWebSocket(/realtime/, (route) => {
    intentosDeConexion += 1
    const esPrimeraConexion = intentosDeConexion === 1
    route.onMessage((raw) => {
      let msg: unknown
      try { msg = JSON.parse(raw.toString()) } catch { return }
      const [jr, ref, t, event] = msg as [string, string, string, string]
      const reply = (payload: unknown) => route.send(JSON.stringify([jr, ref, t, 'phx_reply', payload]))
      if (event === 'phx_join') {
        reply({ status: 'ok', response: {} })
        if (!esPrimeraConexion) {
          // Solo la reconexión trae al otro colaborador -- así la aserción de
          // más abajo prueba específicamente que Presence volvió a funcionar
          // DESPUÉS de la caída, no que nunca dejó de andar.
          const presencia = { 'otro-colaborador': { metas: [{ user_id: 'otro-colaborador', email: 'otro@serenata.test', name: 'Otro', active_section: null, entity_id: null, field: null, online_at: new Date().toISOString(), phx_ref: 'ref-otro' }] } }
          route.send(JSON.stringify([jr, null, t, 'presence_state', presencia]))
        }
        return
      }
      if (event === 'heartbeat' || event === 'access_token' || event === 'presence') {
        reply({ status: 'ok', response: {} })
      }
    })
    if (esPrimeraConexion) {
      // Cierre del lado servidor -- exactamente lo que dispara CHANNEL_ERROR/
      // CLOSED y el reconnect con backoff, sin depender de un timeout largo.
      setTimeout(() => { void route.close() }, 300)
    }
  })

  await login(page, '/cotizaciones/SH-E2E-PRESENCE-RECONNECT')
  await expect(page.getByRole('heading', { name: 'SH-E2E-PRESENCE-RECONNECT' })).toBeVisible()

  await expect(page.getByText('Otro', { exact: true })).toBeVisible({ timeout: 15_000 })
  expect(pageErrors).toEqual([])
})
