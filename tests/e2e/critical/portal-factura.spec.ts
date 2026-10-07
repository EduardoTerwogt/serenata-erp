import { test, expect } from '@playwright/test'
import {
  mockPortalDashboard,
  mockPortalDashboardFacturaExitosa,
  mockPortalFacturaBloqueada,
  mockPortalFacturaDesgloseIncorrecto,
  mockPortalFacturaRegimenIncorrecto,
  mockPortalFacturaValida,
} from '../utils/portal-mocks'

function grupoDePrueba(i: number) {
  return {
    id: `grupo-${i}`,
    es_grupo: true,
    facturable: false,
    proyecto_id: `SH0${i}`,
    proyecto_nombre: `Proyecto ${i}`,
    estado: 'PAGADO',
    monto_total: 1000,
    monto_pagado: 1000,
    saldo_pendiente: 0,
    total_a_transferir: 1160,
    monto_transferido: 1160,
    saldo_por_transferir: 0,
    items: [{ id: `cuenta-${i}`, item_descripcion: 'Item', cantidad: 1, costo_total: 1000, cotizacion_id: `SH0${i}` }],
    pagos: [],
  }
}

async function irATabCuentas(
  page: import('@playwright/test').Page,
  dashboardMock: (page: import('@playwright/test').Page) => Promise<void> = mockPortalDashboard
) {
  await dashboardMock(page)
  await page.goto('/portal')
  await page.getByRole('button', { name: 'Cuentas y facturas' }).click()
}

async function seleccionarYSubir(page: import('@playwright/test').Page) {
  await page.locator('select').selectOption('grupo-1')

  const fileInputs = page.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles({ name: 'factura.xml', mimeType: 'application/xml', buffer: Buffer.from('<cfdi:Comprobante></cfdi:Comprobante>', 'utf-8') })
  await fileInputs.nth(1).setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF', 'utf-8') })
  await page.getByRole('button', { name: 'Validar y subir factura' }).click()
}

test('mismatch de subtotal: muestra ambos montos e invita a contactar a Serenata, sin el bloque de ejemplo', async ({ page }) => {
  await mockPortalFacturaBloqueada(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('$900.00', { exact: false })).toBeVisible()
  await expect(page.getByText('ponte en contacto con nosotros', { exact: false })).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).not.toBeVisible()
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('mismatch de retenciones: mensaje genérico de régimen fiscal, sin el bloque de ejemplo', async ({ page }) => {
  await mockPortalFacturaRegimenIncorrecto(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('no corresponden a tu régimen fiscal', { exact: false })).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).not.toBeVisible()
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('mismatch de desglose (subtotal correcto): mensaje específico y bloque de ejemplo', async ({ page }) => {
  await mockPortalFacturaDesgloseIncorrecto(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('IVA trasladado no coincide')).toBeVisible()
  await expect(page.getByText('Así debe quedar tu factura:')).toBeVisible()
  // "persona moral" aparece dos veces (bloque de ejemplo post-error + panel
  // Simulador, ambos visibles a la vez con el mismo grupo seleccionado).
  await expect(page.getByText('persona moral', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Tu factura se subió correctamente')).not.toBeVisible()
})

test('factura válida: se sube y confirma éxito', async ({ page }) => {
  await mockPortalFacturaValida(page)
  await irATabCuentas(page)
  await seleccionarYSubir(page)

  await expect(page.getByText('Tu factura se subió correctamente')).toBeVisible()
})

test('tras subir con éxito, la cuenta ya no aparece seleccionable y pasa al historial como FACTURADO', async ({ page }) => {
  await irATabCuentas(page, mockPortalDashboardFacturaExitosa)

  await expect(page.getByRole('option', { name: /Spot Verano/ })).toHaveCount(1)
  // El badge de estado se renderiza dos veces (tabla desktop + tarjeta
  // mobile, ambas en el DOM, alternadas por CSS) -- .first() como en el
  // resto de los tests de esta pantalla.
  await expect(page.getByText('ABIERTO').first()).toBeVisible()

  await seleccionarYSubir(page)

  await expect(page.getByText('Tu factura se subió correctamente')).toBeVisible()
  // El grupo recién facturado ya no debe seguir en las opciones del select.
  await expect(page.getByRole('option', { name: /Spot Verano/ })).toHaveCount(0)
  // Y debe verse ahora en la tabla de historial, al fondo de esta misma pantalla.
  await expect(page.getByText('FACTURADO').first()).toBeVisible()
  // Bug real (2026-09-19): el XML/PDF ya subidos se quedaban seleccionados
  // en el formulario después de un envío exitoso -- deben limpiarse por
  // completo, texto y <input> nativo, para poder subir otra factura.
  await expect(page.getByText('Ningún archivo seleccionado')).toHaveCount(2)
  await expect(page.locator('input[type="file"]').nth(0)).toHaveValue('')
  await expect(page.locator('input[type="file"]').nth(1)).toHaveValue('')
})

test('historial con más de 10 cuentas: pagina en vez de volverse una tabla larguísima', async ({ page }) => {
  const grupos = Array.from({ length: 11 }, (_, i) => grupoDePrueba(i + 1))
  await mockPortalDashboard(page, { grupos })
  await page.goto('/portal')
  await page.getByRole('button', { name: 'Cuentas y facturas' }).click()

  await expect(page.getByText('Mostrando 10 de 11', { exact: false })).toBeVisible()
  await expect(page.getByText('Proyecto 1').first()).toBeVisible()
  await expect(page.getByText('Proyecto 11')).toHaveCount(0)

  await page.getByRole('button', { name: 'Página siguiente' }).click()

  await expect(page.getByText('Mostrando 1 de 11', { exact: false })).toBeVisible()
  await expect(page.getByText('Proyecto 11').first()).toBeVisible()
})

test('simulador de factura: se autollena al elegir proyecto, sin subir archivos', async ({ page }) => {
  await irATabCuentas(page)

  await expect(page.getByText('Elige un proyecto en "Subir factura"', { exact: false })).toBeVisible()

  await page.locator('select').selectOption('grupo-1')

  await expect(page.getByText('Así debe quedar tu factura para este proyecto:')).toBeVisible()
  // B2 (D14): el select y la tabla también muestran el total a transferir;
  // la aserción se acota al Total del simulador.
  const simulador = page.locator('dl').filter({ hasText: 'Subtotal' })
  await expect(simulador.getByText('$1,160.00')).toBeVisible()
  await expect(page.getByText('persona moral', { exact: false })).toBeVisible()
})

test('B5 (P12, P29): un pago que cubrió varias facturas lo dice y avisa si falta el complemento PPD', async ({ page }) => {
  const cubre = [
    { grupo_id: 'grupo-1', proyecto_id: 'SH01', factura: 'DS-0412', monto: 580 },
    { grupo_id: 'grupo-2', proyecto_id: 'SH02', factura: 'DS-0415', monto: 232 },
  ]
  const grupo1 = { ...grupoDePrueba(1), pagos: [{ pago_id: 'pg1', fecha_pago: '2026-09-26', tipo_pago: 'TRANSFERENCIA', monto: 580, cubre, complemento: 'pendiente' }] }
  const grupo2 = { ...grupoDePrueba(2), pagos: [{ pago_id: 'pg1', fecha_pago: '2026-09-26', tipo_pago: 'TRANSFERENCIA', monto: 232, cubre, complemento: 'no_aplica' }] }
  await irATabCuentas(page, (p) => mockPortalDashboard(p, { grupos: [grupo1, grupo2] }))

  const pagos = page.getByRole('list', { name: 'Pagos recibidos' }).filter({ visible: true })
  await expect(pagos).toHaveCount(2)
  await expect(pagos.first()).toContainText('Este pago cubrió 2 facturas: DS-0412, DS-0415')
  await expect(pagos.first()).toContainText('$580.00')
  await expect(pagos.first().getByText('Falta tu complemento de pago')).toBeVisible()
  await expect(pagos.nth(1).getByText('Falta tu complemento de pago')).toHaveCount(0)
  // Solo lectura: el Portal no ofrece subir el complemento ni registrar nada desde aquí.
  await expect(pagos.first().getByRole('button')).toHaveCount(0)
})
