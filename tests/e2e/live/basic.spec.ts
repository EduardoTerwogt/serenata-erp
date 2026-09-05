import { test, expect, Page } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix } from '../utils/live-cleanup'

const LIVE_TEST_CLIENTE_PREFIX = 'E2E-LIVE-'

/**
 * Hace clic en "Generar Cotizacion" y espera a que pase UNA de dos cosas
 * reales: navega a /cotizaciones/{id}, o aparece el banner de error rojo de
 * la página (onGenerarCotizacion cayó en su catch). Diagnostico: 3 corridas
 * de CI seguidas se quedaron colgadas en /cotizaciones/nueva sin navegar --
 * subir el timeout no cambió nada (siempre esperaba exactamente el timeout
 * configurado, sin progreso intermedio), lo que apunta a un error real que
 * se estaba tragando en silencio, no a una operación lenta. Este helper
 * saca el texto real del error al log de CI en vez de un timeout genérico.
 */
async function clickGenerarCotizacionOrThrow(page: Page, timeoutMs = 60_000) {
  await page.getByRole('button', { name: 'Generar Cotizacion' }).click()

  const errorBanner = page.locator('.bg-red-900\\/40').first()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (/\/cotizaciones\/SH[A-Z0-9-]+/.test(page.url())) return

    if (await errorBanner.isVisible().catch(() => false)) {
      const text = (await errorBanner.textContent().catch(() => null))?.trim() || '(no se pudo leer el texto del banner)'
      const message = `"Generar Cotizacion" no navego -- error real mostrado por la app: ${text}`
      console.log(`[live test] ${message}`)
      throw new Error(message)
    }

    await page.waitForTimeout(500)
  }

  throw new Error(
    `"Generar Cotizacion" no navego y no aparecio ningun banner de error visible en ${timeoutMs}ms ` +
    `(posible cuelgue silencioso del lado del cliente o del servidor).`
  )
}

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

  // Barre huérfanas de corridas anteriores fallidas (p.ej. si un test murió
  // después de crear la cotización real pero antes de poder leer su id de
  // la URL) para no arrancar sobre basura acumulada.
  test.beforeAll(async () => {
    await cleanupLiveCotizacionesByPrefix(LIVE_TEST_CLIENTE_PREFIX).catch((e) =>
      console.error('[live cleanup] barrido inicial:', e)
    )
  })

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

  // Red de seguridad: si un test murió antes de capturar el id (timeout,
  // error real), esta cotización ya existe en Supabase real y el afterEach
  // de arriba no la limpia -- el barrido final por prefijo sí.
  test.afterAll(async () => {
    await cleanupLiveCotizacionesByPrefix(LIVE_TEST_CLIENTE_PREFIX).catch((e) =>
      console.error('[live cleanup] barrido final:', e)
    )
  })

  test('crear -> emitir -> aprobar -> cuentas generadas -> subir factura real a Drive -> registrar pago', async ({ page }) => {
    // Flujo con ~8 llamadas de red reales secuenciales (Supabase + 2 uploads
    // reales a Google Drive + 2 registros de pago) -- el timeout global de
    // 30s de playwright.config.ts no alcanza. Ademas "Generar Cotizacion"
    // encadena crear + generar PDF real + subir PDF real a Drive (puede
    // crear carpetas nuevas) ANTES de navegar -- cada expect individual de
    // mas abajo tambien necesita margen generoso, no solo el timeout global.
    test.setTimeout(300_000)

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

    // "Generar Cotizacion" encadena crear + generar PDF real + subir PDF a
    // Drive (puede crear carpetas nuevas) antes de navegar -- necesita mucho
    // mas que el default.
    await clickGenerarCotizacionOrThrow(page, 60_000)

    const url = page.url()
    const cotizacionId = url.split('/cotizaciones/')[1]
    happyPathId = cotizacionId

    await expect(page.getByText('EMITIDA', { exact: true })).toBeVisible()

    // 2. Aprobar por el flujo normal de la app (no RPC directo)
    await page.getByRole('button', { name: 'Aprobar Cotización' }).click()
    await expect(page.getByText('¡Cotización aprobada! Proyecto y cuentas creados.')).toBeVisible({ timeout: 30_000 })
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
    await expect(page.getByText('Factura subida correctamente')).toBeVisible({ timeout: 45_000 })

    const facturaLink = page.getByRole('link', { name: 'Ver' }).first()
    await expect(facturaLink).toHaveAttribute('href', /drive\.google\.com/, { timeout: 15_000 })

    // 5. Registrar pago real en Cuentas por Cobrar
    await page.getByRole('button', { name: 'Registrar Pago', exact: true }).click()
    const cobrarForm = page.locator('form')
    await cobrarForm.locator('input[placeholder="0.00"]').fill(String(cuentaCobrar!.monto_total))
    await cobrarForm.getByText('Fecha de Pago', { exact: true }).locator('xpath=following-sibling::*[1]').click()
    await cobrarForm.locator('input[type="date"]').fill('2026-06-05')
    await cobrarForm.getByRole('button', { name: 'Registrar Pago' }).click()
    await expect(page.getByText('Pago registrado correctamente').first()).toBeVisible({ timeout: 30_000 })
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
    await expect(page.getByText('Factura proveedor subida correctamente')).toBeVisible({ timeout: 45_000 })

    const facturaProvLink = page.getByRole('link', { name: 'Ver' }).first()
    await expect(facturaProvLink).toHaveAttribute('href', /drive\.google\.com/, { timeout: 15_000 })

    // 7. Registrar pago real en Cuentas por Pagar
    await page.getByRole('button', { name: 'Registrar Pago', exact: true }).click()
    const pagarForm = page.locator('form')
    await pagarForm.locator('input[placeholder="0.00"]').fill(String(cuentaPagar!.x_pagar))
    await pagarForm.getByRole('button', { name: 'Registrar Pago' }).click()
    await expect(page.getByText('Pago registrado correctamente').first()).toBeVisible({ timeout: 30_000 })
  })

  test('cancela una cotización real y revierte cuentas/proyecto', async ({ page }) => {
    test.setTimeout(150_000)

    const suffix = Date.now()
    const cliente = `E2E-LIVE-CANCEL-${suffix}`
    const proyecto = `Live Cancel ${suffix}`

    await login(page, '/cotizaciones/nueva')
    await page.locator('input[placeholder="Nombre del cliente"]').fill(cliente)
    await page.locator('input[placeholder="Nombre del proyecto"]').fill(proyecto)

    const firstRow = page.locator('table tbody tr').first()
    await firstRow.locator('td').nth(1).locator('input').fill('Item a cancelar E2E live')
    await firstRow.locator('td').nth(3).locator('input').fill('500')

    // Mismo costo real que en el flujo feliz: crear + generar PDF + subir a Drive.
    await clickGenerarCotizacionOrThrow(page, 60_000)

    const url = page.url()
    const cotizacionId = url.split('/cotizaciones/')[1]
    cancelId = cotizacionId

    await expect(page.getByText('EMITIDA', { exact: true })).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await expect(page.getByText('Cotización cancelada. Proyecto y cuentas eliminados.')).toBeVisible({ timeout: 30_000 })
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
