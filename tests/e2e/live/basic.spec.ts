import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { clickGenerarCotizacionOrThrow, liveEnabled } from '../utils/live-helpers'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, cleanupOrphanedFolioReservations, cleanupOrphanedTestProductos } from '../utils/live-cleanup'

const LIVE_TEST_CLIENTE_PREFIX = 'E2E-LIVE-'

test.describe('live smoke', () => {
  test.skip(!liveEnabled, 'Live smoke tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test('logs in and opens cuentas on a live environment', async ({ page }) => {
    await login(page, '/cuentas')
    await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible()
    // Rediseño de Cuentas (B4): la pantalla abre en el periodo del mes con su selector.
    await expect(page.getByRole('group', { name: 'Mes del evento' })).toBeVisible()
  })
})

test.describe('live: ciclo completo de cotización contra Supabase y Drive de prueba reales', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')

  test.describe.configure({ mode: 'serial' })

  let happyPathId: string | null = null
  let cancelId: string | null = null

  // Barre huérfanas de corridas anteriores fallidas (p.ej. si un test murió
  // después de crear la cotización real pero antes de poder leer su id de
  // la URL) para no arrancar sobre basura acumulada. También limpia
  // reservas de folio huérfanas (ver cleanupOrphanedFolioReservations) --
  // causa real confirmada del fallo "duplicate key ... folio_key" en CI.
  test.beforeAll(async () => {
    await cleanupLiveCotizacionesByPrefix(LIVE_TEST_CLIENTE_PREFIX).catch((e) =>
      console.error('[live cleanup] barrido inicial:', e)
    )
    await cleanupOrphanedFolioReservations().catch((e) =>
      console.error('[live cleanup] reservas de folio huerfanas:', e)
    )
    await cleanupOrphanedTestProductos().catch((e) =>
      console.error('[live cleanup] productos huerfanos:', e)
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
    // EF-3 3B-2: GET /api/cuentas-cobrar responde {rows, total_rows, ...} de
    // la RPC buscar_cuentas_cobrar -- ya no un arreglo plano. Se busca por
    // el folio real (cotizacionId) para no depender de que la cuenta caiga
    // en la página 1 por default (orden created_at desc, page_size 50).
    const cobrarRes = await page.request.get(`/api/cuentas-cobrar?search=${cotizacionId}`)
    const { rows: cuentasCobrar } = await cobrarRes.json() as { rows: Array<{ id: string; cotizacion_id: string; monto_total: number }> }
    const cuentaCobrar = cuentasCobrar.find((c) => c.cotizacion_id === cotizacionId)
    expect(cuentaCobrar, 'debe existir una cuenta por cobrar real para esta cotización').toBeTruthy()

    // EF-3 3B-3: GET /api/cuentas-pagar responde {rows, total_rows, ...} de
    // la RPC buscar_cuentas_pagar -- ya no un arreglo plano.
    const pagarRes = await page.request.get(`/api/cuentas-pagar?search=${cotizacionId}`)
    const { rows: cuentasPagar } = await pagarRes.json() as { rows: Array<{ id: string; cotizacion_id: string; x_pagar: number }> }
    const cuentaPagar = cuentasPagar.find((c) => c.cotizacion_id === cotizacionId)
    expect(cuentaPagar, 'debe existir una cuenta por pagar real para esta cotización').toBeTruthy()

    // 4. Subir factura real a Drive desde el detalle del cobro (B5). El
    // concepto se abre por su URL (det = 'c:<id>', estado en la URL, S15);
    // XML y PDF van en peticiones separadas (supuesto 15).
    await page.goto(`/cuentas?det=c:${cuentaCobrar!.id}&tab=docs`)
    const detCobro = page.getByRole('dialog', { name: cliente })
    await expect(detCobro.getByText('Factura XML', { exact: true })).toBeVisible({ timeout: 30_000 })

    const facturaXml = `<cfdi:Comprobante Folio="E2E${suffix}" Fecha="2026-06-01T10:00:00" Total="1000.00"></cfdi:Comprobante>`
    await detCobro.locator('input[type="file"][accept*="xml"]').first().setInputFiles({ name: 'factura.xml', mimeType: 'application/xml', buffer: Buffer.from(facturaXml, 'utf-8') })
    await expect(detCobro.getByText('Factura XML subida')).toBeVisible({ timeout: 45_000 })
    await detCobro.locator('input[type="file"][accept*="pdf"]').first().setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
    await expect(detCobro.getByText('Factura PDF subida')).toBeVisible({ timeout: 45_000 })
    await expect(detCobro.getByRole('link', { name: 'Ver' }).first()).toHaveAttribute('href', /drive\.google\.com/, { timeout: 15_000 })

    // 5. Registrar el cobro completo (el monto por defecto es el saldo).
    await detCobro.getByRole('button', { name: 'Registrar pago' }).first().click()
    await expect(detCobro.getByLabel('Monto')).toHaveValue(Number(cuentaCobrar!.monto_total).toFixed(2))
    await detCobro.locator('form').getByRole('button', { name: 'Registrar pago' }).click()
    await expect(detCobro.getByText('Cobro registrado')).toBeVisible({ timeout: 30_000 })
    await expect(detCobro.getByText('Cuenta saldada. No hay saldo pendiente por registrar.')).toBeVisible({ timeout: 15_000 })
    await detCobro.getByRole('button', { name: 'Cerrar' }).click()

    // 6. Subir factura de proveedor real a Drive desde el detalle del pago.
    // El renglón no tiene proveedor asignado: es una cuenta suelta ('s:<id>').
    await page.goto(`/cuentas?det=s:${cuentaPagar!.id}&tab=docs`)
    const detPago = page.getByRole('dialog', { name: 'Sin asignar' })
    await expect(detPago.getByText('Factura de proveedor XML')).toBeVisible({ timeout: 30_000 })
    const facturaProvXml = `<cfdi:Comprobante Fecha="2026-06-01T10:00:00"></cfdi:Comprobante>`
    await detPago.locator('input[type="file"][accept*="xml"]').first().setInputFiles({ name: 'factura_proveedor.xml', mimeType: 'application/xml', buffer: Buffer.from(facturaProvXml, 'utf-8') })
    await expect(detPago.getByText('Factura XML subida')).toBeVisible({ timeout: 45_000 })
    await detPago.locator('input[type="file"][accept*="pdf"]').first().setInputFiles({ name: 'factura_proveedor.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
    await expect(detPago.getByText('Factura PDF subida')).toBeVisible({ timeout: 45_000 })
    await expect(detPago.getByRole('link', { name: 'Ver' }).first()).toHaveAttribute('href', /drive\.google\.com/, { timeout: 15_000 })

    // 7. Sin proveedor asignado, el pago está bloqueado (T2): la pestaña lo
    // dice y lleva a Información; no se registra nada.
    await detPago.getByRole('button', { name: 'Registrar pago' }).first().click()
    await expect(detPago.getByText('Asigna un proveedor en Información para poder registrar el pago.')).toBeVisible()
    await expect(detPago.getByLabel('Monto')).toHaveCount(0)
    const pagada = await page.request.get(`/api/cuentas-pagar?search=${cotizacionId}`)
    const { rows: trasPago } = await pagada.json() as { rows: Array<{ cotizacion_id: string; monto_pagado: number | null }> }
    expect(Number(trasPago.find((c) => c.cotizacion_id === cotizacionId)?.monto_pagado ?? 0)).toBe(0)
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
    // EF-3 3B-2: {rows, total_rows, ...} en vez de un arreglo plano -- se
    // busca por el folio real para no depender de la página 1 por default.
    const cobrarRes = await page.request.get(`/api/cuentas-cobrar?search=${cotizacionId}`)
    const { rows: cuentasCobrar } = await cobrarRes.json() as { rows: Array<{ cotizacion_id: string }> }
    expect(cuentasCobrar.some((c) => c.cotizacion_id === cotizacionId)).toBe(false)

    // EF-3 3B-3: {rows, total_rows, ...} en vez de un arreglo plano.
    const pagarRes = await page.request.get(`/api/cuentas-pagar?search=${cotizacionId}`)
    const { rows: cuentasPagar } = await pagarRes.json() as { rows: Array<{ cotizacion_id: string }> }
    expect(cuentasPagar.some((c) => c.cotizacion_id === cotizacionId)).toBe(false)
  })
})
