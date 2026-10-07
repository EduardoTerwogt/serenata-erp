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
