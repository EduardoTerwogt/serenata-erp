import { test, expect, type Page } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasAcciones } from '../utils/cuentas-acciones-mocks'
import { mockCuentasDetalle } from '../utils/cuentas-detalle-mocks'
import { mockCuentasPeriodo } from '../utils/cuentas-periodo-mocks'

/**
 * Rediseño de Cuentas B5: detalle del concepto. Modal de 780px en escritorio
 * (proyecto chromium) y hoja al 88% en móvil (proyecto mobile). El detalle
 * sale del armado real del servidor (detalle-armar.ts) sobre el fixture del
 * handoff. #123 (P22): el alta de un pago, de una factura o de un complemento ya no vive aquí: los botones del
 * detalle abren las ventanas de Acciones con la contraparte y el proyecto del concepto preseleccionados.
 */
async function abrirConcepto(page: Page, seccion: 'Entradas · Clientes' | 'Salidas · Proveedores', texto: string) {
  // Las rutas registradas al final ganan: el detalle conserva su `GET /api/proveedores` (el select de responsable).
  const acciones = await mockCuentasAcciones(page)
  const llamadas = await mockCuentasDetalle(page)
  await mockCuentasPeriodo(page)
  await login(page, '/cuentas?anio=2026&mes=9&proyecto=SH061')
  await page.getByRole('region', { name: seccion }).getByText(texto).filter({ visible: true }).first().click()
  return { ...llamadas, acciones }
}

test('cobro parcial: avance, información y el pago se registra en la ventana con el proyecto preseleccionado', async ({ page }) => {
  const llamadas = await abrirConcepto(page, 'Entradas · Clientes', 'Cotización SH061')
  await expect(page).toHaveURL(/det=c(%3A|:)SH061-cc0/)
  const det = page.getByRole('dialog', { name: 'Grupo Modelo' })
  await expect(det.getByText('50% cobrado').first()).toBeVisible()
  await expect(det.getByText('Saldo $174,000.00')).toBeVisible()
  await expect(det.getByText('Saldo pendiente')).toBeVisible()

  await det.getByRole('button', { name: 'Registrar pago' }).first().click()
  await expect(page).toHaveURL(/tab=pago/)
  // El formulario viejo ya no existe: el alta es de la ventana Registrar pago (P22).
  await expect(det.getByLabel('Monto')).toHaveCount(0)
  await expect(det.getByText(/Saldo pendiente \$174,000\.00/)).toBeVisible()
  await det.getByRole('button', { name: 'Registrar pago' }).last().click()

  await expect(page).toHaveURL(/sheet=pago/)
  await expect(page).toHaveURL(/lado=cobro/)
  await expect(page).toHaveURL(/cid=cli-grupo-modelo/)
  await expect(page).toHaveURL(/pre=SH061/)
  const ventana = page.getByRole('dialog', { name: 'Registrar pago' })
  await expect(ventana.getByText('Grupo Altavista S.A. de C.V.').first()).toBeVisible()
  await ventana.getByLabel('Monto recibido').fill('100000')
  await ventana.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(ventana.getByText('Pago registrado')).toBeVisible()
  expect(llamadas.acciones.pagos).toHaveLength(1)
  expect(llamadas.pagos).toHaveLength(0)

  // Al cerrar la ventana se vuelve al detalle, que se pidió de nuevo.
  await ventana.getByRole('button', { name: 'Cerrar' }).last().click()
  await expect(page).toHaveURL(/det=/)
  await expect(page).not.toHaveURL(/sheet=pago/)
  await expect(page.getByRole('dialog', { name: 'Grupo Modelo' })).toBeVisible()
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
  await expect(det.getByRole('button', { name: 'Registrar pago' }).last()).toBeVisible()
  await expect(det.getByLabel('Monto')).toHaveCount(0)
  await det.getByRole('button', { name: 'Ir a Documentos' }).click()
  await expect(page).toHaveURL(/tab=docs/)

  await expect(det.getByText('Factura de proveedor XML')).toBeVisible()
  await expect(det.getByText('PDFs y otros archivos deben pesar menos de 4 MB.')).toBeVisible()

  // Un PDF de más de 4 MB se rechaza antes de subir (supuesto 15).
  await det.locator('input[type=file][accept*="pdf"]').first().setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4 * 1024 * 1024 + 1) })
  await expect(det.getByText('"grande.pdf" pesa más de 4 MB. Reduce el archivo e intenta de nuevo.')).toBeVisible()
  expect(llamadas.subidas).toHaveLength(0)

  // El alta de la factura es de la ventana Subir factura (P22): ya no hay un selector de XML en el detalle.
  await expect(det.locator('input[type=file][accept*="xml"]')).toHaveCount(0)
  await det.getByRole('button', { name: 'Subir factura' }).click()
  await expect(page).toHaveURL(/sheet=factura/)
  await expect(page).toHaveURL(/lado=proveedor/)
  await expect(page).toHaveURL(/pre=SH061/)
  await expect(page.getByRole('dialog', { name: 'Subir factura' })).toBeVisible()
  expect(llamadas.subidas).toHaveLength(0)
})

test('grupo de facturación: desglose, facturación agrupada y el pago se abre en la ventana', async ({ page }) => {
  await abrirConcepto(page, 'Salidas · Proveedores', 'Iluminación Pro CDMX')
  const det = page.getByRole('dialog', { name: 'Iluminación Pro CDMX' })
  await expect(det.getByText('GRUPO DE FACTURACIÓN')).toBeVisible()
  await expect(det.getByText('3 conceptos · una factura')).toBeVisible()

  await det.getByRole('button', { name: 'Documentos' }).click()
  await expect(det.getByText(/factura agrupado en este proyecto/)).toBeVisible()
  await expect(det.getByText('Válida')).toBeVisible()

  await det.getByRole('button', { name: 'Registrar pago' }).first().click()
  await expect(det.getByText(/Por transferir \$79,344\.00\./)).toBeVisible()
  await expect(det.getByLabel('Monto')).toHaveCount(0)
  await det.getByRole('button', { name: 'Registrar pago' }).last().click()
  await expect(page).toHaveURL(/sheet=pago/)
  await expect(page).toHaveURL(/lado=proveedor/)
  await expect(page).toHaveURL(/pre=SH061/)
  await expect(page.getByRole('dialog', { name: 'Registrar pago' })).toBeVisible()
})
