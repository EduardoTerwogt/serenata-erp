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
