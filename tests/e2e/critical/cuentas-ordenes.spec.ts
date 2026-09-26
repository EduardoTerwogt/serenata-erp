import { test, expect, type Page } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasDetalle } from '../utils/cuentas-detalle-mocks'
import { mockCuentasOrdenes } from '../utils/cuentas-ordenes-mocks'
import { mockCuentasPeriodo } from '../utils/cuentas-periodo-mocks'

/**
 * Rediseño de Cuentas B6: avisos, "Nueva orden" e historial. Escritorio:
 * panel lateral de 400px y modales (chromium). Móvil: pantallas empujadas
 * "‹ Cuentas" y hojas (mobile, 390 × 844). El preview sale del armado real
 * (preview-cuentas.ts) sobre el fixture del handoff.
 */
const esMovil = () => test.info().project.name === 'mobile'

async function abrir(page: Page, url = '/cuentas?anio=2026&mes=9') {
  await mockCuentasDetalle(page)
  const llamadas = await mockCuentasOrdenes(page)
  await mockCuentasPeriodo(page)
  await login(page, url)
  await expect(page.getByRole('heading', { name: 'Cuentas', level: 1 })).toBeVisible()
  return llamadas
}

test('avisos: por categoría; tocar uno limpia filtros y abre el proyecto en su mes', async ({ page }) => {
  await abrir(page, '/cuentas?anio=2026&mes=9&tipo=pago')
  if (esMovil()) await page.getByRole('button', { name: /^Avisos/ }).click()
  else await page.getByRole('button', { name: /^Avisos/ }).first().click()
  await expect(page).toHaveURL(/page_m=avisos/)
  const panel = page.getByRole('dialog', { name: esMovil() ? 'Avisos' : 'Avisos y órdenes' })
  const vencidos = panel.getByRole('region', { name: 'Cobros vencidos' })
  await expect(vencidos.getByText('Liverpool · Campaña Día de Muertos')).toBeVisible()
  await expect(panel.getByRole('region', { name: 'Facturas de proveedor faltantes' }).getByText('Mario Hernández · Lanzamiento Aurora 2026')).toBeVisible()

  await vencidos.getByRole('button', { name: /Liverpool · Campaña Día de Muertos/ }).click()
  await expect(page).not.toHaveURL(/page_m=/)
  await expect(page).toHaveURL(/proyecto=SH058/)
  await expect(page).toHaveURL(/mes=8/)
  await expect(page).not.toHaveURL(/tipo=pago/)
})

test('nueva orden: excluir un responsable, generar y ver la orden lista', async ({ page }) => {
  const llamadas = await abrir(page)
  if (esMovil()) await page.getByRole('button', { name: 'Órdenes de pago' }).click()
  else await page.getByRole('button', { name: 'Orden de pago' }).click()
  await expect(page).toHaveURL(/page_m=ordenes/)
  await expect(page.getByText('2 cuentas · 2 proveedores · $96,504.00 a transferir')).toBeVisible()

  await page.getByRole('button', { name: 'Revisar y generar' }).click()
  await expect(page).toHaveURL(/sheet=orden/)
  const modal = page.getByRole('dialog', { name: 'Generar orden de pago' })
  await expect(modal.getByText('$96,504.00')).toBeVisible()
  await expect(modal.getByRole('region', { name: 'No incluidas' }).getByText('Falta factura del proveedor').first()).toBeVisible()

  // Excluir a Mario Hernández: el pie recalcula (D8).
  await modal.getByRole('checkbox', { name: 'Incluir a Mario Hernández' }).click()
  await expect(modal.getByText('1 cuenta · 1 responsable')).toBeVisible()
  await expect(modal.getByText('$79,344.00').last()).toBeVisible()

  // Tocar la fila expande el desglose con el cruce por grupo.
  await modal.getByRole('button', { name: /Iluminación Pro CDMX/ }).click()
  await expect(modal.getByText('Paquete de iluminación ARRI SkyPanel · parte 1')).toBeVisible()
  await expect(modal.getByText('A transferir', { exact: true })).toBeVisible()

  await modal.getByRole('button', { name: 'Generar orden PDF' }).click()
  await expect(modal.getByText('Orden generada')).toBeVisible()
  await expect(modal.getByText(/1 cuenta · \$79,344\.00/)).toBeVisible()
  expect(llamadas.generar).toHaveLength(1)
  expect(llamadas.generar[0].seleccion).toEqual([{ tipo: 'grupo', id: 'SH061-g0', monto_esperado: 68400 }])
  expect(llamadas.generar[0].idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
  await expect(modal.getByRole(esMovil() ? 'button' : 'link', { name: esMovil() ? 'Compartir PDF' : 'Descargar PDF' })).toBeVisible()
})

test('historial: filtro por estado y cancelar una orden vencida sin pagos', async ({ page }) => {
  const llamadas = await abrir(page, '/cuentas?anio=2026&mes=9&page_m=ordenes')
  let historial
  if (esMovil()) {
    historial = page.getByRole('region', { name: 'Historial de órdenes' })
    await historial.getByRole('button', { name: /Todas/ }).click()
    const hoja = page.getByRole('dialog', { name: 'Estado de la orden' })
    await hoja.getByText('Vencida').click()
    await expect(historial.getByText('O.P 19-Sep SH058,SH061')).toHaveCount(0)
  } else {
    await page.getByRole('button', { name: 'Ver todo (6)' }).click()
    await expect(page).toHaveURL(/sheet=historial/)
    historial = page.getByRole('dialog', { name: 'Historial de órdenes' })
    await expect(historial.getByText('Mostrando 6 de 6 órdenes')).toBeVisible()
    await historial.getByPlaceholder('Buscar por folio').fill('SH059')
    await expect(historial.getByText('Mostrando 1 de 1 orden')).toBeVisible()
  }

  await historial.getByRole('button', { name: /O\.P 01-Sep SH059/ }).click()
  await historial.getByRole('button', { name: 'Cancelar orden' }).click()
  await historial.getByLabel('Motivo de la cancelación').fill('El proveedor cambió de cuenta')
  await historial.getByRole('button', { name: 'Confirmar cancelación' }).click()
  await expect.poll(() => llamadas.cancelar).toEqual([{ id: 'o3', motivo: 'El proveedor cambió de cuenta' }])
})
