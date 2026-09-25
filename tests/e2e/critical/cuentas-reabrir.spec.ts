import { test, expect, type Page } from '@playwright/test'
import { login, mockSesionAdmin } from '../utils/auth'
import { mockCuentasDetalle } from '../utils/cuentas-detalle-mocks'
import { mockCuentasPeriodo } from '../utils/cuentas-periodo-mocks'

/**
 * Rediseño de Cuentas B7 (D5, D6): Reabrir y Volver a cerrar solo para admin,
 * con motivo obligatorio; las correcciones del detalle solo aparecen con las
 * cuentas reabiertas. SH062 tiene todo cobrado y pagado: cuentas cerradas.
 */
async function abrirProyecto(page: Page, { admin }: { admin: boolean }) {
  if (admin) await mockSesionAdmin(page)
  const llamadas = await mockCuentasDetalle(page)
  await mockCuentasPeriodo(page)
  await login(page, '/cuentas?anio=2026&mes=9&proyecto=SH062')
  await expect(page.getByText('Cuentas cerradas automáticamente').filter({ visible: true })).toBeVisible()
  return llamadas
}

const boton = (page: Page, nombre: string) => page.getByRole('button', { name: nombre, exact: true }).filter({ visible: true })

test('sin admin no hay Reabrir ni correcciones', async ({ page }) => {
  await abrirProyecto(page, { admin: false })
  await expect(boton(page, 'Reabrir')).toHaveCount(0)
})

test('admin: reabrir con motivo obligatorio, corregir y volver a cerrar', async ({ page }) => {
  const llamadas = await abrirProyecto(page, { admin: true })

  await boton(page, 'Reabrir').click()
  const modal = page.getByRole('dialog', { name: 'Reabrir' })
  const confirmar = modal.getByRole('button', { name: 'Reabrir', exact: true })
  await expect(confirmar).toBeDisabled()
  await modal.getByLabel('Motivo').fill('Factura del proveedor con RFC equivocado')
  await confirmar.click()

  expect(llamadas.reapertura).toEqual([{ url: expect.stringContaining('/api/cuentas/proyectos/SH062/reabrir'), cuerpo: { motivo: 'Factura del proveedor con RFC equivocado' } }])
  await expect(page.getByText('Cuentas reabiertas manualmente').filter({ visible: true })).toBeVisible()
  await expect(boton(page, 'Volver a cerrar')).toBeVisible()

  // Detalle del cobro: correcciones visibles; anular un pago pide motivo.
  await page.getByRole('region', { name: 'Entradas · Clientes' }).getByText('Cotización SH062').filter({ visible: true }).first().click()
  const det = page.getByRole('dialog', { name: 'Zara México' })
  await expect(det.getByText('Cuentas reabiertas: puedes anular pagos')).toBeVisible()
  await expect(det.getByRole('button', { name: 'Corregir fechas y notas' })).toBeVisible()
  await det.getByRole('button', { name: 'Registrar pago' }).first().click()
  await det.getByRole('button', { name: 'Anular' }).click()
  const anular = det.getByRole('button', { name: 'Anular pago' })
  await expect(anular).toBeDisabled()
  await det.getByLabel('Motivo').fill('Pago duplicado')
  await anular.click()
  await expect(det.getByText('Pago anulado')).toBeVisible()
  expect(llamadas.correcciones).toEqual([{ accion: 'anular_pago', dominio: 'cobro', pago_id: 'SH062-pc0', motivo: 'Pago duplicado' }])

  // Documentos: la factura validada solo se reemplaza con motivo, por la subida normal.
  await det.getByRole('button', { name: 'Documentos' }).click()
  await det.locator('input[type=file][accept*="xml"]').first().setInputFiles({ name: 'nueva.xml', mimeType: 'text/xml', buffer: Buffer.from('<cfdi/>') })
  await det.getByLabel('Motivo').fill('RFC equivocado')
  await det.getByRole('button', { name: 'Reemplazar factura' }).click()
  await expect(det.getByText('Factura reemplazada')).toBeVisible()
  expect(llamadas.subidas.at(-1)).toEqual({ url: expect.stringContaining('/api/cuentas-cobrar/SH062-cc0/subir-factura'), campos: ['factura_xml', 'motivo'] })

  await det.getByRole('button', { name: 'Cerrar' }).click()
  await boton(page, 'Volver a cerrar').click()
  await page.getByRole('dialog', { name: 'Volver a cerrar' }).getByRole('button', { name: 'Volver a cerrar', exact: true }).click()
  expect(llamadas.reapertura.at(-1)?.url).toContain('/api/cuentas/proyectos/SH062/cerrar')
  await expect(boton(page, 'Reabrir')).toBeVisible()
})
