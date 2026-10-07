import { test, expect, type Page } from '@playwright/test'
import { login } from '../utils/auth'
import { CLIENTE, PROVEEDOR, mockCuentasAcciones, type LlamadasAcciones, type OpcionesAcciones } from '../utils/cuentas-acciones-mocks'
import { mockCuentasDetalle } from '../utils/cuentas-detalle-mocks'
import { mockCuentasOrdenes } from '../utils/cuentas-ordenes-mocks'
import { mockCuentasPeriodo } from '../utils/cuentas-periodo-mocks'

/**
 * #123 (B4): menú Acciones y sus ventanas, con el ejemplo del issue (6 cotizaciones, 2 facturas, 1 depósito).
 * Escritorio (chromium) y móvil (mobile, 390 × 844): el menú es uno solo con dos disparadores.
 */
async function abrir(page: Page, opciones?: OpcionesAcciones, url = '/cuentas?anio=2026&mes=9'): Promise<LlamadasAcciones> {
  await mockCuentasDetalle(page)
  await mockCuentasOrdenes(page)
  await mockCuentasPeriodo(page)
  const llamadas = await mockCuentasAcciones(page, opciones)
  await login(page, url)
  await expect(page.getByRole('heading', { name: 'Cuentas', level: 1 })).toBeVisible()
  return llamadas
}

async function elegirAccion(page: Page, nombre: string) {
  await page.getByRole('button', { name: 'Acciones' }).click()
  await page.getByRole('menuitem', { name: nombre }).click()
}

async function elegirCliente(page: Page) {
  const modal = page.getByRole('dialog', { name: 'Registrar pago' })
  await modal.getByRole('searchbox').or(modal.getByPlaceholder('Buscar cliente por nombre')).fill('altavista')
  await modal.getByRole('option', { name: CLIENTE.nombre }).click()
  await expect(page).toHaveURL(/cid=cli-altavista/)
  return modal
}

test('menú Acciones: un menú con las entradas, Escape lo cierra y devuelve el foco', async ({ page }) => {
  await abrir(page)
  const boton = page.getByRole('button', { name: 'Acciones' })
  await boton.click()
  const menu = page.getByRole('menu', { name: 'Acciones' })
  await expect(menu.getByRole('menuitem', { name: 'Registrar pago' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Orden de pago' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(boton).toBeFocused()
})

test('registrar pago: el depósito del issue se reparte de la factura más antigua a la más reciente y se registra', async ({ page }) => {
  const llamadas = await abrir(page)
  await elegirAccion(page, 'Registrar pago')
  await expect(page).toHaveURL(/sheet=pago/)
  const modal = await elegirCliente(page)

  await modal.getByLabel('Monto recibido').fill('300000')
  // La sugerencia llena la Factura A (SH001, SH003, SH004) y deja $10,000 en SH006.
  await expect(modal.getByText('Aplicado $300,000.00 de $300,000.00')).toBeVisible()
  await expect(modal.getByText('Por aplicar $0.00 · 1 factura')).toBeVisible()
  const facturaA = modal.getByRole('button', { name: /F-A_Altavista/ })
  await expect(facturaA).toContainText('$300,000.00')
  await facturaA.click()
  await expect(modal.getByLabel('Aplicar a SH006')).toHaveValue('10000.00')

  await modal.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(modal.getByText('Pago registrado')).toBeVisible()
  expect(llamadas.pagos).toHaveLength(1)
  const p = llamadas.pagos[0]
  expect(p.lado).toBe('cobro')
  expect(p.tipo_pago).toBe('TRANSFERENCIA')
  expect(p.lineas.map((l) => [l.id, l.monto, l.saldo_esperado])).toEqual([
    ['cobro-SH001', 185600, 185600],
    ['cobro-SH003', 58000, 58000],
    ['cobro-SH004', 46400, 46400],
    ['cobro-SH006', 10000, 69600],
  ])
  expect(p.operation_id).toMatch(/^[0-9a-f-]{36}$/)
})

test('registrar pago: bloquea si lo aplicado no cuadra o si una línea pasa de su saldo', async ({ page }) => {
  const llamadas = await abrir(page)
  await elegirAccion(page, 'Registrar pago')
  const modal = await elegirCliente(page)
  const registrar = modal.getByRole('button', { name: 'Registrar pago' })

  await expect(registrar).toBeDisabled()
  await modal.getByLabel('Monto recibido').fill('300000')
  await expect(registrar).toBeEnabled()

  // Reparto a mano: SH006 recibe de más que su saldo ($69,600).
  await modal.getByRole('button', { name: /F-A_Altavista/ }).click()
  await modal.getByLabel('Aplicar a SH006').fill('80000')
  await expect(modal.getByText(/SH006: el monto es mayor que su saldo/)).toBeVisible()
  await expect(registrar).toBeDisabled()

  // Menos de lo recibido: quedan $10,000 (lo que la sugerencia había puesto en SH006) por aplicar.
  await modal.getByLabel('Aplicar a SH006').fill('0')
  await expect(modal.getByText(/por aplicar\. Lo recibido y lo aplicado deben ser iguales/)).toContainText('$10,000.00')
  await expect(registrar).toBeDisabled()

  // "Sugerir" devuelve el reparto de la más antigua primero.
  await modal.getByRole('button', { name: 'Sugerir: la más antigua primero' }).click()
  await expect(registrar).toBeEnabled()
  expect(llamadas.pagos).toHaveLength(0)
})

test('registrar pago: si los saldos cambiaron el servidor responde 409, se avisa y no se pierde la captura', async ({ page }) => {
  const llamadas = await abrir(page, { pago: { status: 409, body: { error: 'candidatos_cambiaron', message: 'Los saldos cambiaron.' } } })
  await elegirAccion(page, 'Registrar pago')
  const modal = await elegirCliente(page)
  await modal.getByLabel('Monto recibido').fill('100000')
  await modal.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(modal.getByText(/Los saldos cambiaron mientras capturabas el pago/)).toBeVisible()
  await expect(modal.getByLabel('Monto recibido')).toHaveValue('100000')
  expect(llamadas.pagos).toHaveLength(1)
})

test('registrar pago a proveedor: cada factura es un proyecto y el pago liquida las tres', async ({ page }) => {
  const llamadas = await abrir(page)
  await elegirAccion(page, 'Registrar pago')
  const modal = page.getByRole('dialog', { name: 'Registrar pago' })
  await modal.getByRole('button', { name: 'Pago a proveedor' }).click()
  await expect(page).toHaveURL(/lado=proveedor/)
  await modal.getByPlaceholder('Buscar proveedor por nombre').fill('distrito')
  await modal.getByRole('option', { name: PROVEEDOR.nombre }).click()
  await expect(modal.getByText('DS-0419')).toBeVisible()

  await modal.getByLabel('Monto transferido').fill('96280')
  await expect(modal.getByText('Aplicado $96,280.00 de $96,280.00')).toBeVisible()
  await expect(modal.getByText('Por aplicar $0.00 · 3 facturas')).toBeVisible()
  await modal.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(modal.getByText('Pago registrado')).toBeVisible()
  expect(llamadas.pagos[0].lado).toBe('proveedor')
  expect(llamadas.pagos[0].lineas.map((l) => l.id)).toEqual(['grupo-SH001', 'grupo-SH003', 'grupo-SH004'])
})

// ── Subir factura (B4b) ─────────────────────────────────────────────────────────────────────────────────────────

const xml = (name: string) => ({ name, mimeType: 'text/xml', buffer: Buffer.from('<cfdi:Comprobante/>') })

async function subirXml(page: Page, nombre: string) {
  await elegirAccion(page, 'Subir factura')
  await expect(page).toHaveURL(/sheet=factura/)
  const modal = page.getByRole('dialog', { name: 'Subir factura' })
  await modal.locator('input[type="file"]').first().setInputFiles(xml(nombre))
  return modal
}

test('subir factura: el XML con folios marca las cotizaciones, cuadra y se guarda como Válida', async ({ page }) => {
  const llamadas = await abrir(page)
  const modal = await subirXml(page, 'folios.xml')

  await expect(modal.getByText(CLIENTE.nombre).first()).toBeVisible()
  await expect(modal.getByText('Marcadas por los folios del CFDI')).toBeVisible()
  for (const f of ['SH001', 'SH003', 'SH004', 'SH006']) await expect(modal.getByRole('checkbox', { name: `Incluir ${f}` })).toHaveAttribute('aria-checked', 'true')
  for (const f of ['SH002', 'SH005']) await expect(modal.getByRole('checkbox', { name: `Incluir ${f}` })).toHaveAttribute('aria-checked', 'false')
  await expect(modal.getByText(/La suma de las cotizaciones coincide con el total del XML/)).toBeVisible()
  await expect(modal.getByText('4 cotizaciones · Grupo Altavista S.A. de C.V.')).toBeVisible()

  await modal.getByRole('button', { name: 'Guardar factura' }).click()
  await expect(modal.getByText('Factura guardada')).toBeVisible()
  expect(llamadas.facturas).toHaveLength(1)
  expect(llamadas.facturas[0].cuentas).toEqual([
    { id: 'cobro-SH001', monto_esperado: 185600 },
    { id: 'cobro-SH003', monto_esperado: 58000 },
    { id: 'cobro-SH004', monto_esperado: 46400 },
    { id: 'cobro-SH006', monto_esperado: 69600 },
  ])
  expect(llamadas.facturas[0].operation_id).toMatch(/^[0-9a-f-]{36}$/)
})

test('subir factura: si el total no cuadra se avisa con el detalle y se guarda "En revisión"', async ({ page }) => {
  const llamadas = await abrir(page, { factura: { status: 200, body: { success: true, estado_validacion: 'revision', detalle_validacion: 'El XML suma $359,600.00 y las cotizaciones ligadas suman $290,000.00' } } })
  const modal = await subirXml(page, 'folios.xml')
  await expect(modal.getByText(/La suma de las cotizaciones coincide/)).toBeVisible()

  // Quitar SH006 ($69,600): el XML ya no cuadra y la ventana lo dice con los números de SQL.
  await modal.getByRole('checkbox', { name: 'Incluir SH006' }).click()
  await expect(modal.getByText(/No cuadra: XML \$359,600\.00 vs\. cotizaciones \$290,000\.00 \(faltan \$69,600\.00\)/)).toBeVisible()
  await expect(modal.getByText('En revisión').first()).toBeVisible()
  await modal.getByRole('button', { name: 'Guardar en revisión' }).click()
  await expect(modal.getByText('Factura guardada en revisión')).toBeVisible()
  expect(llamadas.facturas[0].cuentas).toHaveLength(3)
})

test('subir factura: un CFDI sin folios se arma a mano y no se guarda sin cotizaciones', async ({ page }) => {
  const llamadas = await abrir(page)
  const modal = await subirXml(page, 'generico.xml')
  await expect(modal.getByText('El CFDI no trae folios: elige a mano')).toBeVisible()
  const guardar = modal.getByRole('button', { name: 'Guardar factura' })
  await expect(guardar).toBeDisabled()
  await expect(modal.getByText('Marca las cotizaciones que cubre esta factura.')).toBeVisible()
  await modal.getByRole('checkbox', { name: 'Incluir SH001' }).click()
  await expect(modal.getByRole('button', { name: 'Guardar en revisión' })).toBeEnabled()
  expect(llamadas.facturas).toHaveLength(0)
})

test('subir factura: un RFC sin ficha se elige a mano y se ofrece guardar el RFC', async ({ page }) => {
  const llamadas = await abrir(page)
  const modal = await subirXml(page, 'sinrfc.xml')
  await expect(modal.getByText(/No hay un cliente con el RFC XAXX010101000/)).toBeVisible()
  await modal.getByPlaceholder('Buscar cliente por nombre').fill('altavista')
  await modal.getByRole('option', { name: CLIENTE.nombre }).click()
  await expect(modal.getByText(/Guardar el RFC XAXX010101000 en la ficha/)).toBeVisible()
  await modal.getByRole('checkbox', { name: 'Incluir SH001' }).click()
  await modal.getByRole('button', { name: /Guardar/ }).last().click()
  await expect(modal.getByText(/Factura guardada/)).toBeVisible()
  expect(llamadas.facturas[0].guardar_rfc).toBe(true)
  expect(llamadas.facturas[0].contraparte_id).toBe(CLIENTE.id)
})

test('subir factura: XML ajeno o repetido se rechazan con su explicación', async ({ page }) => {
  await abrir(page)
  let modal = await subirXml(page, 'ajeno.xml')
  await expect(modal.getByText('El XML no es de ni para Serenata: revisa que sea el archivo correcto.')).toBeVisible()
  await modal.getByRole('button', { name: 'Cancelar' }).or(modal.getByRole('button', { name: 'Cerrar' }).first()).first().click()

  modal = await subirXml(page, 'duplicada.xml')
  await expect(modal.getByText(/Esta factura ya está registrada \(mismo UUID\)/)).toBeVisible()
  await expect(modal.getByRole('button', { name: /Guardar/ }).last()).toBeDisabled()
})

test('subir factura de proveedor: se liga al proyecto que nombran los folios', async ({ page }) => {
  const llamadas = await abrir(page)
  const modal = await subirXml(page, 'proveedor.xml')
  await expect(modal.getByText(PROVEEDOR.nombre).first()).toBeVisible()
  await expect(modal.getByRole('radio', { name: 'Elegir SH004' })).toHaveAttribute('aria-checked', 'true')
  await expect(modal.getByText(/El total coincide con lo que se le debe/)).toBeVisible()
  await modal.getByRole('button', { name: 'Guardar factura' }).click()
  await expect(modal.getByText('Factura guardada')).toBeVisible()
  expect(llamadas.facturas[0].grupo_id).toBe('grupo-SH004')
})

test('subir complemento de pago: se liga por el UUID de la factura', async ({ page }) => {
  const llamadas = await abrir(page)
  const modal = await subirXml(page, 'complemento.xml')
  await expect(modal.getByText(/Es un complemento de pago\./)).toBeVisible()
  await expect(modal.getByText('Factura registrada')).toBeVisible()
  await modal.getByRole('button', { name: 'Guardar complemento' }).click()
  await expect(modal.getByText('Complemento guardado')).toBeVisible()
  expect(llamadas.facturas).toHaveLength(1)
})

// ── Estado de cuenta (B4c) ──────────────────────────────────────────────────────────────────────────────────────

test('estado de cuenta: resumen, facturas con su complemento y el pago aplicado', async ({ page }) => {
  await abrir(page, { conPago: true })
  await elegirAccion(page, 'Estado de cuenta')
  await expect(page).toHaveURL(/sheet=estado/)
  const modal = page.getByRole('dialog', { name: 'Estado de cuenta' })
  await modal.getByPlaceholder('Buscar cliente por nombre').fill('altavista')
  await modal.getByRole('option', { name: CLIENTE.nombre }).click()

  await expect(modal.getByText('$487,200.00').first()).toBeVisible()
  await expect(modal.getByText('$300,000.00').first()).toBeVisible()
  await expect(modal.getByText('$187,200.00').first()).toBeVisible()
  // La Factura A es PPD, tiene un pago y ningún complemento: está pendiente.
  await expect(modal.getByText(/F-A_Altavista: es PPD y falta su complemento de pago/)).toBeVisible()
  const filaA = modal.getByRole('row', { name: /F-A_Altavista.*Parcial/ })
  await expect(filaA).toContainText('$359,600.00')
  await expect(filaA).toContainText('$59,600.00')
  await expect(filaA).toContainText('Parcial')
  await expect(filaA).toContainText('SH001 · SH003 · SH004 · SH006')
  // El depósito se muestra una sola vez, aplicado a las cuatro cotizaciones de la factura.
  const filaPago = modal.getByRole('row', { name: /30 sep 2026/ })
  await expect(filaPago).toContainText('F-A_Altavista · SH001, SH003, SH004, SH006')
  await expect(filaPago.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', 'https://drive.test/transferencia_BBVA_30sep.pdf')
  await expect(modal.getByText('Saldo').last()).toBeVisible()
})

test('estado de cuenta: abierto desde un chip resalta el documento y la URL conserva el contexto', async ({ page }) => {
  await abrir(page, { conPago: true }, '/cuentas?anio=2026&mes=9&sheet=estado&lado=cobro&cid=cli-altavista&doc=fa')
  const modal = page.getByRole('dialog', { name: 'Estado de cuenta' })
  await expect(modal.getByText('Grupo Altavista S.A. de C.V.').first()).toBeVisible()
  await expect(modal.locator('tr[data-resaltada]')).toHaveCount(1)
  await expect(modal.locator('tr[data-resaltada]')).toContainText('F-A_Altavista')
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(page).not.toHaveURL(/sheet=estado/)
})

// ── Chip de factura o pago compartido (B4d, P20) ────────────────────────────────────────────────────────────────

test('chip de una factura compartida: abre el estado de cuenta con la factura resaltada y no abre el detalle', async ({ page }) => {
  await abrir(page, { conPago: true }, '/cuentas?anio=2026&mes=9&proyecto=SH061')
  const chip = page.getByRole('button', { name: /^Factura · 4 cot\.:/ })
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(page).toHaveURL(/sheet=estado/)
  await expect(page).toHaveURL(/lado=cobro/)
  await expect(page).toHaveURL(/cid=cli-modelo/)
  await expect(page).toHaveURL(/doc=fa/)
  await expect(page).not.toHaveURL(/det=/)
  const modal = page.getByRole('dialog', { name: 'Estado de cuenta' })
  await expect(modal.locator('tr[data-resaltada]')).toContainText('F-A_Altavista')
})

test('chip de un pago compartido: resalta el pago', async ({ page }) => {
  await abrir(page, { conPago: true }, '/cuentas?anio=2026&mes=9&proyecto=SH061')
  await page.getByRole('button', { name: /^Pago · 3 cuentas:/ }).click()
  await expect(page).toHaveURL(/doc=pago-1/)
  const modal = page.getByRole('dialog', { name: 'Estado de cuenta' })
  await expect(modal.locator('tr[data-resaltada]')).toContainText('30 sep 2026')
})
