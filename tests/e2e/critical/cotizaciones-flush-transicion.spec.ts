// Fase 8.7 (Bloque 1): "Generar Cotización" y "Aprobar" deben esperar TODO lo
// que el usuario editó -- incluido lo que todavía no disparó su fetch porque
// el debounce de 800ms sigue corriendo -- y abortar la transición si ese
// guardado falla (409 de conflicto o 500). Antes de este bloque ninguna de
// las dos cosas era cierta para General/Totales/Partidas (solo Notas
// trackeaba la operación completa), y "Generar PDF" standalone no llamaba a
// flushPendingSaves en absoluto. Cubre las 5 vías de guardado -- General,
// Totales, Partidas, Notas y el botón standalone "Generar PDF" -- y el guard
// contra doble click.
import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCotizacionDetailApis } from '../utils/quotation-detail-mocks'
import { fulfillJson } from '../utils/http'

function conflictBody(entity: string, id: string, field: string) {
  return {
    error: 'conflict',
    entity,
    id,
    fields: { [field]: { base: 'valor-viejo', current: 'valor-de-otro-colaborador', attempted: 'lo-que-intentaba-guardar' } },
  }
}

async function mockEmitir(
  page: import('@playwright/test').Page,
  id: string,
  cotizacion: { estado: string },
  onCalled?: () => void
) {
  await page.route(`**/api/cotizaciones/${id}/emitir`, async (route) => {
    onCalled?.()
    // `emitirCotizacion()` del cliente ignora este body y relee vía GET
    // /api/cotizaciones/:id -- ese GET usa el mismo objeto `cotizacion`
    // mutable que arma mockCotizacionDetailApis, así que hay que actualizar
    // su estado aquí para que la transición se refleje.
    cotizacion.estado = 'EMITIDA'
    await fulfillJson(route, { estado: 'EMITIDA' })
  })
}

test.describe('flush previo a Generar/Aprobar', () => {
  test('General: una edición de <800ms se espera y se aplica antes de Aprobar', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-GEN-OK'
    await mockCotizacionDetailApis(page, { id, estado: 'EMITIDA' })
    let aprobarCalled = false
    await page.route(`**/api/cotizaciones/${id}/aprobar`, async (route) => {
      aprobarCalled = true
      await fulfillJson(route, { already_approved: false, cotizacion_id: id })
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const locacionInput = page.locator('input[placeholder="Lugar del evento"]')
    await locacionInput.fill('Locación editada al vuelo')
    // Sin blur: el debounce de 800ms de General sigue corriendo cuando se
    // hace click en Aprobar de inmediato.
    const [generalRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/general') && req.method() === 'PATCH'),
      page.getByRole('button', { name: 'Aprobar Cotización' }).click(),
    ])

    expect(generalRequest.postDataJSON().locacion).toBe('Locación editada al vuelo')
    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
    expect(aprobarCalled).toBe(true)
  })

  test('General: un 409 en el PATCH pendiente aborta Aprobar en vez de pasar de largo', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-GEN-409'
    await mockCotizacionDetailApis(page, { id, estado: 'EMITIDA' })
    let aprobarCalled = false
    await page.route(`**/api/cotizaciones/${id}/aprobar`, async (route) => {
      aprobarCalled = true
      await fulfillJson(route, { already_approved: false, cotizacion_id: id })
    })
    await page.route(`**/api/cotizaciones/${id}/general`, async (route) => {
      await fulfillJson(route, conflictBody('cotizacion_general', id, 'locacion'), 409)
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    await page.locator('input[placeholder="Lugar del evento"]').fill('Edición que va a chocar')
    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()

    await expect(page.getByText('Hay cambios recientes que no se guardaron correctamente. Revisa antes de aprobar.')).toBeVisible()
    await expect(page.getByText('EMITIDA', { exact: true })).toBeVisible()
    expect(aprobarCalled).toBe(false)
  })

  test('Totales: un 500 en el PATCH pendiente aborta Aprobar', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-TOT-500'
    await mockCotizacionDetailApis(page, { id, estado: 'EMITIDA' })
    let aprobarCalled = false
    await page.route(`**/api/cotizaciones/${id}/aprobar`, async (route) => {
      aprobarCalled = true
      await fulfillJson(route, { already_approved: false, cotizacion_id: id })
    })
    await page.route(`**/api/cotizaciones/${id}/totales`, async (route) => {
      await fulfillJson(route, { error: 'Error actualizando configuración de totales' }, 500)
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const feeInput = page.locator('input[type="number"][max="100"]')
    await feeInput.fill('30')
    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()

    await expect(page.getByText('Hay cambios recientes que no se guardaron correctamente. Revisa antes de aprobar.')).toBeVisible()
    await expect(page.getByText('EMITIDA', { exact: true })).toBeVisible()
    expect(aprobarCalled).toBe(false)
  })

  test('Partidas: una edición de celda de <800ms se espera y se aplica antes de Generar Cotización', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-ITEM-OK'
    const cotizacion = await mockCotizacionDetailApis(page, { id, estado: 'BORRADOR' })
    await mockEmitir(page, id, cotizacion)
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const descripcion = page.locator('table tbody tr').first().locator('td').nth(1).locator('input')
    await descripcion.fill('Renta de cámara editada al vuelo')
    const [itemRequest] = await Promise.all([
      page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
      page.getByRole('button', { name: 'Generar Cotización' }).click(),
    ])

    expect(itemRequest.postDataJSON().descripcion).toBe('Renta de cámara editada al vuelo')
    await expect(page.getByRole('button', { name: 'Aprobar Cotización' })).toBeVisible()
  })

  test('Partidas: un 409 en una celda pendiente aborta Generar Cotización', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-ITEM-409'
    const cotizacion = await mockCotizacionDetailApis(page, { id, estado: 'BORRADOR' })
    let emitirCalled = false
    await mockEmitir(page, id, cotizacion, () => { emitirCalled = true })
    await page.route(`**/api/cotizaciones/${id}/items/*`, async (route) => {
      if (route.request().method() !== 'PATCH') { await route.fallback(); return }
      await fulfillJson(route, conflictBody('item_cotizacion', 'item-detail-1', 'descripcion'), 409)
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const descripcion = page.locator('table tbody tr').first().locator('td').nth(1).locator('input')
    await descripcion.fill('Edición que va a chocar')
    await page.getByRole('button', { name: 'Generar Cotización' }).click()

    await expect(page.getByText('Hay cambios recientes que no se guardaron correctamente. Revisa antes de generar.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generar Cotización' })).toBeVisible()
    expect(emitirCalled).toBe(false)
  })

  test('Notas: un 500 en el PATCH pendiente aborta Generar Cotización', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-NOTAS-500'
    const cotizacion = await mockCotizacionDetailApis(page, { id, estado: 'BORRADOR' })
    let emitirCalled = false
    await mockEmitir(page, id, cotizacion, () => { emitirCalled = true })
    await page.route(`**/api/cotizaciones/${id}/notas`, async (route) => {
      await fulfillJson(route, { error: 'Error guardando notas internas' }, 500)
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    await page.locator('textarea[placeholder="Sin notas..."]').fill('Llamado 6am, cambia todo')
    await page.getByRole('button', { name: 'Generar Cotización' }).click()

    await expect(page.getByText('Hay cambios recientes que no se guardaron correctamente. Revisa antes de generar.')).toBeVisible()
    expect(emitirCalled).toBe(false)
  })

  test('Generar PDF (standalone): una edición de <800ms se espera antes de generar el PDF', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-PDF-OK'
    await mockCotizacionDetailApis(page, { id, estado: 'EMITIDA' })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    await page.locator('input[placeholder="Lugar del evento"]').fill('Locación antes del PDF')
    const [generalRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/general') && req.method() === 'PATCH'),
      page.getByRole('button', { name: 'Generar PDF' }).click(),
    ])

    expect(generalRequest.postDataJSON().locacion).toBe('Locación antes del PDF')
    await expect(page.getByText('PDF guardado exitosamente en Drive')).toBeVisible()
  })

  test('Generar PDF (standalone): un 409 en el PATCH pendiente aborta la generación', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-PDF-409'
    await mockCotizacionDetailApis(page, { id, estado: 'EMITIDA' })
    let generarPdfCalled = false
    await page.route(`**/api/cotizaciones/${id}/generar-pdf`, async () => { generarPdfCalled = true })
    await page.route(`**/api/cotizaciones/${id}/general`, async (route) => {
      await fulfillJson(route, conflictBody('cotizacion_general', id, 'locacion'), 409)
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    await page.locator('input[placeholder="Lugar del evento"]').fill('Edición que va a chocar')
    await page.getByRole('button', { name: 'Generar PDF' }).click()

    await expect(page.getByText('Hay cambios recientes que no se guardaron correctamente. Revisa antes de generar el PDF.')).toBeVisible()
    expect(generarPdfCalled).toBe(false)
  })

  test('Aprobar: un doble click no dispara la RPC dos veces', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-DOBLE-CLICK'
    await mockCotizacionDetailApis(page, { id, estado: 'EMITIDA' })
    let aprobarCallCount = 0
    await page.route(`**/api/cotizaciones/${id}/aprobar`, async (route) => {
      aprobarCallCount += 1
      await new Promise((r) => setTimeout(r, 100))
      await fulfillJson(route, { already_approved: false, cotizacion_id: id })
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    // Dos clicks síncronos en el mismo tick de JS -- el escenario real que
    // `transitionInFlightRef` cubre: un `setState` (que deshabilita el botón)
    // no alcanza a aplicarse entre uno y otro.
    await page.evaluate(() => {
      const boton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Aprobar Cotización')) as HTMLButtonElement
      boton.click()
      boton.click()
    })

    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
    expect(aprobarCallCount).toBe(1)
  })
})

// Fase 8.7.1: la auditoría sobre 8.7 encontró que `flushPendingSaves` solo
// esperaba las 4 vías que ya pasaban por `trackMutation` (General, Totales,
// celda de partida, Notas) -- seleccionar un producto, cambiar responsable,
// agregar fila, eliminar fila e importar partidas usaban
// `enqueueRowMutation`/`pendingRowCreationsRef`, invisibles para el flush.
// `itemLatencyMs` deja la petición real todavía en vuelo cuando se hace click
// inmediato en Generar/Aprobar -- sin eso, la petición mock resuelve tan
// rápido que la carrera nunca se ejercita de verdad.
test.describe('flush previo a Generar/Aprobar -- las 5 vías que faltaban', () => {
  test('Producto: seleccionar una sugerencia y pulsar inmediatamente Generar Cotización espera el autofill', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-PRODUCTO-GENERAR'
    const cotizacion = await mockCotizacionDetailApis(page, {
      id, estado: 'BORRADOR', itemLatencyMs: 300,
      productos: [{ id: 'prod-1', descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar_sugerido: 12000, activo: true, created_at: '2026-01-01' }],
    })
    await mockEmitir(page, id, cotizacion)
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const firstRow = page.locator('table tbody tr').first()
    const descripcion = firstRow.locator('td').nth(1).locator('input')
    await descripcion.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await descripcion.fill('grúa Techno')

    await Promise.all([
      page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
      page.getByText('Renta de grúa Technocrane').click(),
    ])

    // El PATCH del autofill sigue resolviendo (itemLatencyMs=300) cuando se hace
    // click en Generar de inmediato -- sin el flush de esta vía, la transición
    // podía correr antes de que el autofill se confirmara en el servidor.
    await page.getByRole('button', { name: 'Generar Cotización' }).click()

    await expect(page.getByRole('button', { name: 'Aprobar Cotización' })).toBeVisible()
    await expect(descripcion).toHaveValue('Renta de grúa Technocrane')
  })

  test('Producto: seleccionar una sugerencia y pulsar inmediatamente Aprobar espera el autofill', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-PRODUCTO-APROBAR'
    await mockCotizacionDetailApis(page, {
      id, estado: 'EMITIDA', itemLatencyMs: 300,
      productos: [{ id: 'prod-1', descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar_sugerido: 12000, activo: true, created_at: '2026-01-01' }],
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const firstRow = page.locator('table tbody tr').first()
    const descripcion = firstRow.locator('td').nth(1).locator('input')
    await descripcion.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await descripcion.fill('grúa Techno')

    await Promise.all([
      page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
      page.getByText('Renta de grúa Technocrane').click(),
    ])

    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()

    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
    // Aprobada la cotización, la tabla pasa a solo-lectura (QuotationItemsSection
    // editable=false): ya no hay <input>, se lee el texto de la celda -- y ese
    // texto viene del fetch canónico post-transición, así que confirma que el
    // autofill sí quedó incluido.
    await expect(page.locator('table tbody tr').first().locator('td').nth(1)).toHaveText('Renta de grúa Technocrane')
  })

  test('Responsable: cambiarlo y pulsar inmediatamente Aprobar espera el cambio', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-RESPONSABLE-APROBAR'
    await mockCotizacionDetailApis(page, {
      id, estado: 'EMITIDA', itemLatencyMs: 300,
      responsables: [
        { id: 'resp-1', nombre: 'Sofía Ramírez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Camarógrafa'], notas: null, activo: true, created_at: '2026-01-01' },
        { id: 'resp-2', nombre: 'Juan Pérez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Gaffer'], notas: null, activo: true, created_at: '2026-01-01' },
      ],
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const responsableSelect = page.locator('table tbody tr').first().locator('td').nth(5).locator('select')
    await Promise.all([
      page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH' && 'responsable_id' in (req.postDataJSON() || {})),
      responsableSelect.selectOption('resp-2'),
    ])

    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()

    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
    // Ya no hay <select> en modo solo-lectura -- se lee el nombre en la celda.
    await expect(page.locator('table tbody tr').first().locator('td').nth(5)).toContainText('Juan Pérez')
  })

  test('Agregar fila: pulsar inmediatamente Generar Cotización espera el alta', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-AGREGAR-GENERAR'
    const cotizacion = await mockCotizacionDetailApis(page, { id, estado: 'BORRADOR', itemLatencyMs: 300 })
    await mockEmitir(page, id, cotizacion)
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const rows = page.locator('table tbody tr')
    await Promise.all([
      page.waitForRequest((req) => req.url().endsWith('/items') && req.method() === 'POST'),
      page.getByRole('button', { name: /Agregar fila/ }).click(),
    ])

    // La fila nueva sigue en `pendingRowCreationsRef` (el POST no ha resuelto,
    // itemLatencyMs=300) cuando se hace click en Generar de inmediato.
    await page.getByRole('button', { name: 'Generar Cotización' }).click()

    await expect(page.getByRole('button', { name: 'Aprobar Cotización' })).toBeVisible()
    await expect(rows).toHaveCount(2)
  })

  test('Eliminar fila: pulsar inmediatamente Aprobar espera el borrado', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-ELIMINAR-APROBAR'
    await mockCotizacionDetailApis(page, {
      id, estado: 'EMITIDA', itemLatencyMs: 300,
      items: [
        { id: 'item-detail-1', cotizacion_id: id, categoria: 'Producción', descripcion: 'Renta de cámara', cantidad: 1, precio_unitario: 15000, importe: 15000, responsable_nombre: 'Sofía Ramírez', responsable_id: 'resp-1', x_pagar: 6000, margen: 9000, orden: 1, notas: null },
        { id: 'item-detail-2', cotizacion_id: id, categoria: 'Audio', descripcion: 'Boom más micrófono', cantidad: 1, precio_unitario: 5000, importe: 5000, responsable_nombre: null, responsable_id: null, x_pagar: 2000, margen: 3000, orden: 2, notas: null },
      ],
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(2)
    const deleteSecondRow = rows.nth(1).locator('td').last().locator('button')
    await Promise.all([
      page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'DELETE'),
      deleteSecondRow.click(),
    ])

    // El DELETE sigue en vuelo (itemLatencyMs=300) cuando se hace click en
    // Aprobar de inmediato.
    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()

    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
    await expect(rows).toHaveCount(1)
  })

  test('Importar partidas (plantilla): pulsar inmediatamente Aprobar espera la importación', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-IMPORTAR-APROBAR'
    await mockCotizacionDetailApis(page, {
      id, estado: 'EMITIDA', itemLatencyMs: 300,
      templates: [{
        id: 'tpl-1', nombre: 'Paquete básico', descripcion: null, activo: true,
        items: [{ categoria: 'Producción', descripcion: 'Cámara', cantidad: 1, precio_unitario: 10000, x_pagar: 4000 }],
      }],
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const rows = page.locator('table tbody tr')
    await Promise.all([
      page.waitForRequest((req) => req.url().endsWith('/items/bulk') && req.method() === 'POST'),
      page.locator('select').filter({ hasText: 'Plantilla de servicios' }).selectOption('tpl-1'),
    ])

    // La importación sigue resolviendo (itemLatencyMs=300) cuando se hace click
    // en Aprobar de inmediato.
    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()

    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
    await expect(rows.nth(1).locator('td').nth(1)).toHaveText('Cámara')
  })

  test('Agregar fila: un 500 en el POST pendiente aborta Generar Cotización', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-AGREGAR-500'
    const cotizacion = await mockCotizacionDetailApis(page, { id, estado: 'BORRADOR' })
    let emitirCalled = false
    await mockEmitir(page, id, cotizacion, () => { emitirCalled = true })
    // Registrado DESPUÉS de mockCotizacionDetailApis -- en Playwright gana la
    // última ruta registrada, así que este override sí intercepta el POST.
    // La respuesta se retiene hasta soltarla a mano (en vez de una latencia
    // fija en ms): un plazo fijo es una carrera de verdad contra el reloj de
    // la máquina de CI -- bajo carga, el 500 podía resolver (y el catch propio
    // de handleAddRow reaccionar) ANTES de que se alcanzara a clickear Generar,
    // vaciando `pendingMutationsRef` y dejando la carrera sin ejercitarse.
    // Reteniendo la respuesta se garantiza que el POST sigue en vuelo en el
    // instante exacto en que Generar se clickea, sin depender del timing.
    let liberarRespuesta: () => void = () => {}
    const respuestaRetenida = new Promise<void>((resolve) => { liberarRespuesta = resolve })
    await page.route(`**/api/cotizaciones/${id}/items`, async (route) => {
      if (route.request().method() !== 'POST') { await route.fallback(); return }
      await respuestaRetenida
      await fulfillJson(route, { error: 'Error creando partida' }, 500)
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    await Promise.all([
      page.waitForRequest((req) => req.url().endsWith('/items') && req.method() === 'POST'),
      page.getByRole('button', { name: /Agregar fila/ }).click(),
    ])
    await page.getByRole('button', { name: 'Generar Cotización' }).click()
    liberarRespuesta()

    await expect(page.getByText('Hay cambios recientes que no se guardaron correctamente. Revisa antes de generar.')).toBeVisible()
    expect(emitirCalled).toBe(false)
  })

  test('Producto: doble click en Aprobar con el autofill todavía en vuelo no dispara la RPC dos veces', async ({ page }) => {
    const id = 'SH-E2E-FLUSH-PRODUCTO-DOBLE-CLICK'
    await mockCotizacionDetailApis(page, {
      id, estado: 'EMITIDA', itemLatencyMs: 300,
      productos: [{ id: 'prod-1', descripcion: 'Renta de grúa Technocrane', categoria: 'Grip', precio_unitario: 25000, x_pagar_sugerido: 12000, activo: true, created_at: '2026-01-01' }],
    })
    let aprobarCallCount = 0
    await page.route(`**/api/cotizaciones/${id}/aprobar`, async (route) => {
      aprobarCallCount += 1
      await fulfillJson(route, { already_approved: false, cotizacion_id: id })
    })
    await login(page, `/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: id })).toBeVisible()

    const firstRow = page.locator('table tbody tr').first()
    const descripcion = firstRow.locator('td').nth(1).locator('input')
    await descripcion.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await descripcion.fill('grúa Techno')
    await Promise.all([
      page.waitForRequest((req) => /\/items\/[^/]+$/.test(req.url()) && req.method() === 'PATCH'),
      page.getByText('Renta de grúa Technocrane').click(),
    ])

    // Dos clicks síncronos en el mismo tick de JS, con el autofill todavía en
    // vuelo -- transitionInFlightRef debe seguir cubriendo este caso igual que
    // sin mutaciones pendientes.
    await page.evaluate(() => {
      const boton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Aprobar Cotización')) as HTMLButtonElement
      boton.click()
      boton.click()
    })

    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible()
    expect(aprobarCallCount).toBe(1)
  })
})
