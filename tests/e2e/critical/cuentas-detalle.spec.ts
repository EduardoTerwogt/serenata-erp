import { test, expect, type Page } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasDetalle } from '../utils/cuentas-detalle-mocks'
import { HOY_E2E, mockCuentasPeriodo } from '../utils/cuentas-periodo-mocks'

/**
 * Rediseño de Cuentas B5: detalle del concepto. Modal de 780px en escritorio
 * (proyecto chromium) y hoja al 88% en móvil (proyecto mobile). El detalle
 * sale del armado real del servidor (detalle-armar.ts) sobre el fixture del
 * handoff; registrar un pago lo ven el detalle y la lista que se vuelven a pedir.
 */
async function abrirConcepto(page: Page, seccion: 'Entradas · Clientes' | 'Salidas · Proveedores', texto: string) {
  const llamadas = await mockCuentasDetalle(page)
  await mockCuentasPeriodo(page)
  await login(page, '/cuentas?anio=2026&mes=9&proyecto=SH061')
  await page.getByRole('region', { name: seccion }).getByText(texto).filter({ visible: true }).first().click()
  return llamadas
}

test('cobro parcial: avance, información y abono con la idempotencia vigente', async ({ page }) => {
  const llamadas = await abrirConcepto(page, 'Entradas · Clientes', 'Cotización SH061')
  await expect(page).toHaveURL(/det=c(%3A|:)SH061-cc0/)
  const det = page.getByRole('dialog', { name: 'Grupo Modelo' })
  await expect(det.getByText('50% cobrado').first()).toBeVisible()
  await expect(det.getByText('Saldo $174,000.00')).toBeVisible()
  await expect(det.getByText('Saldo pendiente')).toBeVisible()

  await det.getByRole('button', { name: 'Registrar pago' }).first().click()
  await expect(page).toHaveURL(/tab=pago/)
  const monto = det.getByLabel('Monto')
  await expect(monto).toHaveValue('174000.00')
  await monto.fill('74000')
  await det.locator('form').getByRole('button', { name: 'Registrar pago' }).click()

  await expect(det.getByText('Cobro registrado')).toBeVisible()
  expect(llamadas.pagos).toHaveLength(1)
  expect(llamadas.pagos[0].campos).toMatchObject({ monto: '74000', tipo_pago: 'TRANSFERENCIA', fecha_pago: HOY_E2E })
  expect(llamadas.pagos[0].campos.operation_id).toBeTruthy()
  await expect(det.getByText('71% cobrado').first()).toBeVisible()
  await expect(det.getByText('Saldo $100,000.00')).toBeVisible()

  await det.getByRole('button', { name: 'Cerrar' }).click()
  await expect(page).not.toHaveURL(/det=/)
})

test('pago a proveedor sin factura: bloqueado, lleva a Documentos y sube el XML', async ({ page }) => {
  const llamadas = await abrirConcepto(page, 'Salidas · Proveedores', 'Mario Hernández')
  const det = page.getByRole('dialog', { name: 'Mario Hernández' })

  // Información: régimen, cruce fiscal (D29) y select de responsable (D21).
  await expect(det.getByText('Persona física (honorarios)')).toBeVisible()
  await expect(det.getByText('Costo total · neto al proveedor')).toBeVisible()
  await expect(det.getByText('Retención de ISR · 10%')).toBeVisible()
  await expect(det.getByText('Total a transferir', { exact: true })).toBeVisible()
  await expect(det.getByText('$40,040.00', { exact: true })).toBeVisible()
  await expect(det.getByLabel('Responsable / proveedor')).toHaveValue('prov-Mario Hernández')

  await det.getByRole('button', { name: 'Registrar pago' }).first().click()
  await expect(det.getByText('Sube la factura del proveedor en Documentos para poder registrar el pago.')).toBeVisible()
  await expect(det.getByLabel('Monto')).toHaveCount(0)
  await det.getByRole('button', { name: 'Ir a Documentos' }).click()
  await expect(page).toHaveURL(/tab=docs/)

  await expect(det.getByText('Factura de proveedor XML')).toBeVisible()
  await expect(det.getByText('PDFs y otros archivos deben pesar menos de 4 MB.')).toBeVisible()

  // Un PDF de más de 4 MB se rechaza antes de subir (supuesto 15).
  await det.locator('input[type=file][accept*="pdf"]').first().setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024 + 1) })
  await expect(det.getByText('"grande.pdf" pesa más de 4 MB. Reduce el archivo e intenta de nuevo.')).toBeVisible()
  expect(llamadas.subidas).toHaveLength(0)

  await det.locator('input[type=file][accept*="xml"]').first().setInputFiles({ name: 'factura.xml', mimeType: 'text/xml', buffer: Buffer.from('<cfdi:Comprobante/>') })
  await expect(det.getByText('Factura XML subida')).toBeVisible()
  expect(llamadas.subidas).toEqual([{ url: expect.stringMatching(/\/api\/cuentas-pagar\/grupos\/SH061-g1\/subir-factura$/), campos: ['factura_proveedor_xml'] }])
})

test('grupo de facturación: desglose, pago repartido con comprobante e historial', async ({ page }) => {
  const llamadas = await abrirConcepto(page, 'Salidas · Proveedores', 'Iluminación Pro CDMX')
  const det = page.getByRole('dialog', { name: 'Iluminación Pro CDMX' })
  await expect(det.getByText('GRUPO DE FACTURACIÓN')).toBeVisible()
  await expect(det.getByText('3 conceptos · una factura')).toBeVisible()

  await det.getByRole('button', { name: 'Documentos' }).click()
  await expect(det.getByText(/factura agrupado en este proyecto/)).toBeVisible()
  await expect(det.getByText('Válida')).toBeVisible()

  await det.getByRole('button', { name: 'Registrar pago' }).first().click()
  await expect(det.getByText('El pago se reparte entre los 3 conceptos del grupo. Total a transferir: $79,344.00.')).toBeVisible()
  await expect(det.getByLabel('Monto')).toHaveValue('79344.00')
  await det.getByRole('combobox').selectOption('EFECTIVO')
  await det.locator('input[type=file][capture]').setInputFiles({ name: 'recibo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
  await expect(det.getByText('recibo.pdf')).toBeVisible()
  await det.locator('form').getByRole('button', { name: 'Registrar pago' }).click()

  await expect(det.getByText('Pago registrado')).toBeVisible()
  expect(llamadas.pagos[0].url).toMatch(/\/api\/cuentas-pagar\/grupos\/SH061-g0\/registrar-pago$/)
  expect(llamadas.pagos[0].campos).toMatchObject({ monto: '79344', tipo_pago: 'EFECTIVO', comprobante: 'archivo:recibo.pdf' })
  await expect(det.getByText('Cuenta saldada. No hay saldo pendiente por registrar.')).toBeVisible()
  await expect(det.getByText('Efectivo')).toBeVisible()
})
