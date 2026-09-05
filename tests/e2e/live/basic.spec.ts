import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion } from '../utils/live-cleanup'

const liveEnabled = Boolean(
  process.env.PLAYWRIGHT_BASE_URL &&
  process.env.PLAYWRIGHT_TEST_EMAIL &&
  process.env.PLAYWRIGHT_TEST_PASSWORD &&
  process.env.PLAYWRIGHT_E2E_BYPASS !== 'true'
)

test.describe('live smoke', () => {
  test.skip(!liveEnabled, 'Live smoke tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('logs in and opens cuentas on a live environment', async ({ page }) => {
    await login(page, '/cuentas')
    await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Por Cobrar/i })).toBeVisible()
  })
})

test.describe('live: ciclo completo de cotización contra Supabase y Drive de prueba reales', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test.describe.configure({ mode: 'serial' })

  let happyPathId: string | null = null
  let cancelId: string | null = null

  test.afterEach(async () => {
    if (happyPathId) {
      await cleanupLiveCotizacion(happyPathId).catch((e) => console.error('[live cleanup] happy path:', e))
      happyPathId = null
    }
    if (cancelId) {
      await cleanupLiveCotizacion(cancelId).catch((e) => console.error('[live cleanup] cancel:', e))
      cancelId = null
    }
  })

  test('crear -> emitir -> aprobar -> cuentas generadas -> subir factura real a Drive -> registrar pago', async ({ page }) => {
    const suffix = Date.now()
    const cliente = `E2E-LIVE-${suffix}`
    const proyecto = `Live Flow ${suffix}`

    // 1. Crear + emitir (un solo paso real de la app: "Generar Cotización")
    await login(page, '/cotizaciones/nueva')
    await page.locator('input[placeholder="Nombre del cliente"]').fill(cliente)
    await page.locator('input[placeholder="Nombre del proyecto"]').fill(proyecto)

    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('td').nth(1).locator('input').fill('Renta de equipo E2E live')
    await firstRow.locator('td').nth(3).locator('input').fill('1000')
    await firstRow.locator('td').nth(6).locator('input').fill('500') // x_pagar

    await page.getByRole('button', { name: 'Generar Cotización' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/(SH[A-Z0-9-]+)/, { timeout: 20_000 })

    const url = page.url()
    const cotizacionId = url.split('/cotizaciones/')[1]
    happyPathId = cotizacionId

    await expect(page.getByText('EMITIDA', { exact: true })).toBeVisible()

    // 2. Aprobar por el flujo normal de la app (no RPC directo)
    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()
    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('APROBADA', { exact: true })).toBeVisible()

    // 3. Confirmar por API real que se generaron cuenta por cobrar y por pagar
    const cobrarRes = await page.request.get('/api/cuentas-cobrar')
    const cuentasCobrar = await cobrarRes.json() as Array<{ id: string; cotizacion_id: string; monto_total: number }>
    const cuentaCobrar = cuentasCobrar.find((c) => c.cotizacion_id === cotizacionId)
    expect(cuentaCobrar, 'debe existir una cuenta por cobrar real para esta cotización').toBeTruthy()

    const pagarRes = await page.request.get('/api/cuentas-pagar')
    const cuentasPagar = await pagarRes.json() as Array<{ id: string; cotizacion_id: string; x_pagar: number }>
    const cuentaPagar = cuentasPagar.find((c) => c.cotizacion_id === cotizacionId)
    expect(cuentaPagar, 'debe existir una cuenta por pagar real para esta cotización').toBeTruthy()

    // 4. Subir factura real a Drive desde Cuentas por Cobrar
    await page.goto('/cuentas')
    await page.locator('tr').filter({ hasText: proyecto }).first().click()
    await page.getByRole('button', { name: 'Documentos', exact: true }).click()

    const facturaXml = `<cfdi:Comprobante Folio="E2E${suffix}" Fecha="2026-06-01T10:00:00" Total="1000.00"></cfdi:Comprobante>`
    const fileInputs = page.locator('input[type="file"]')
    await fileInputs.nth(0).setInputFiles({ name: 'factura.xml', mimeType: 'application/xml', buffer: Buffer.from(facturaXml, 'utf-8') })
    await fileInputs.nth(1).setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
    await page.getByRole('button', { name: 'Subir Factura' }).click()
    await expect(page.getByText('Factura subida correctamente')).toBeVisible({ timeout: 20_000 })

    const facturaLink = page.getByRole('link', { name: 'Ver' }).first()
    await expect(facturaLink).toHaveAttribute('href', /drive\.google\.com/, { timeout: 10_000 })

    // 5. Registrar pago real en Cuentas por Cobrar
    await page.getByRole('button', { name: 'Registrar Pago', exact: true }).click()
    const cobrarForm = page.locator('form')
    await cobrarForm.locator('input[placeholder="0.00"]').fill(String(cuentaCobrar!.monto_total))
    await cobrarForm.getByText('Fecha de Pago', { exact: true }).locator('xpath=following-sibling::*[1]').click()
    await cobrarForm.locator('input[type="date"]').fill('2026-06-05')
    await cobrarForm.getByRole('button', { name: 'Registrar Pago' }).click()
    await expect(page.getByText('Pago registrado correctamente').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/PAGADO/i).first()).toBeVisible()

    await page.getByLabel('Cerrar').click()

    // 6. Subir factura de proveedor real a Drive desde Cuentas por Pagar
    await page.getByRole('button', { name: /Por Pagar/i }).click()
    await page.locator('tr').filter({ hasText: proyecto }).first().click()
    await page.getByRole('button', { name: 'Documentos', exact: true }).click()

    const facturaProvXml = `<cfdi:Comprobante Fecha="2026-06-01T10:00:00"></cfdi:Comprobante>`
    const pagarFileInputs = page.locator('input[type="file"]')
    await pagarFileInputs.nth(0).setInputFiles({ name: 'factura_proveedor.xml', mimeType: 'application/xml', buffer: Buffer.from(facturaProvXml, 'utf-8') })
    await pagarFileInputs.nth(1).setInputFiles({ name: 'factura_proveedor.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
    await page.getByRole('button', { name: 'Subir Factura Proveedor' }).click()
    await expect(page.getByText('Factura proveedor subida correctamente')).toBeVisible({ timeout: 20_000 })

    const facturaProvLink = page.getByRole('link', { name: 'Ver' }).first()
    await expect(facturaProvLink).toHaveAttribute('href', /drive\.google\.com/, { timeout: 10_000 })

    // 7. Registrar pago real en Cuentas por Pagar
    await page.getByRole('button', { name: 'Registrar Pago', exact: true }).click()
    const pagarForm = page.locator('form')
    await pagarForm.locator('input[placeholder="0.00"]').fill(String(cuentaPagar!.x_pagar))
    await pagarForm.getByRole('button', { name: 'Registrar Pago' }).click()
    await expect(page.getByText('Pago registrado correctamente').first()).toBeVisible({ timeout: 20_000 })
  })

  test('cancela una cotización real y revierte cuentas/proyecto', async ({ page }) => {
    const suffix = Date.now()
    const cliente = `E2E-LIVE-CANCEL-${suffix}`
    const proyecto = `Live Cancel ${suffix}`

    await login(page, '/cotizaciones/nueva')
    await page.locator('input[placeholder="Nombre del cliente"]').fill(cliente)
    await page.locator('input[placeholder="Nombre del proyecto"]').fill(proyecto)

    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('td').nth(1).locator('input').fill('Item a cancelar E2E live')
    await firstRow.locator('td').nth(3).locator('input').fill('500')

    await page.getByRole('button', { name: 'Generar Cotización' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/(SH[A-Z0-9-]+)/, { timeout: 20_000 })

    const url = page.url()
    const cotizacionId = url.split('/cotizaciones/')[1]
    cancelId = cotizacionId

    await expect(page.getByText('EMITIDA', { exact: true })).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await expect(page.getByText('Cotización cancelada. Proyecto y cuentas eliminados.')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('CANCELADA', { exact: true })).toBeVisible()

    // Confirmar por API real que no quedó ninguna cuenta generada
    const cobrarRes = await page.request.get('/api/cuentas-cobrar')
    const cuentasCobrar = await cobrarRes.json() as Array<{ cotizacion_id: string }>
    expect(cuentasCobrar.some((c) => c.cotizacion_id === cotizacionId)).toBe(false)

    const pagarRes = await page.request.get('/api/cuentas-pagar')
    const cuentasPagar = await pagarRes.json() as Array<{ cotizacion_id: string }>
    expect(cuentasPagar.some((c) => c.cotizacion_id === cotizacionId)).toBe(false)
  })
})
