import { test, expect, type Page } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasPeriodo } from '../utils/cuentas-periodo-mocks'

/**
 * Rediseño de Cuentas B4: pantalla principal en escritorio (proyecto
 * chromium) y en el viewport móvil de 390 × 844 (proyecto mobile, S21).
 * Los datos salen de la derivación real del servidor sobre el fixture del
 * handoff (utils/cuentas-periodo-mocks.ts).
 */
const esMovil = () => test.info().project.name === 'mobile'

async function abrir(page: Page, url = '/cuentas?anio=2026&mes=9') {
  await mockCuentasPeriodo(page)
  await login(page, url)
  await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible()
}

test('periodo del mes: totales, tarjetas de proyecto y maestro-detalle', async ({ page }) => {
  await abrir(page)
  await expect(page.getByText('Septiembre 2026 · 2 proyectos')).toBeVisible()
  const aurora = page.getByRole('button', { name: 'Abrir Lanzamiento Aurora 2026' })
  await expect(aurora).toContainText('5 pendientes')
  await expect(page.getByRole('button', { name: 'Abrir Sesión de fotos Otoño' })).toContainText('Cerrada')

  await aurora.click()
  await expect(page).toHaveURL(/proyecto=SH061/)
  const entradas = page.getByRole('region', { name: 'Entradas · Clientes' })
  await expect(entradas.getByText('Total $400,200.00')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Salidas · Proveedores' }).getByText('Foros Churubusco').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Cierre del proyecto' }).getByText('Proveedores', { exact: true })).toBeVisible()

  if (esMovil()) {
    // Móvil: el proyecto se abre en hoja; cerrar la hoja regresa a la lista.
    await page.getByRole('dialog', { name: 'Lanzamiento Aurora 2026' }).getByRole('button', { name: 'Cerrar' }).click()
    await expect(page).not.toHaveURL(/proyecto=/)
  } else {
    // Escritorio: tocar el proyecto seleccionado en la lista compacta lo deselecciona.
    await page.getByRole('navigation', { name: 'Proyectos del periodo' }).getByRole('button', { name: /Lanzamiento Aurora 2026/ }).click()
    await expect(page).not.toHaveURL(/proyecto=/)
    await expect(page.getByRole('button', { name: 'Abrir Lanzamiento Aurora 2026' })).toBeVisible()
  }
})

test('"Pendientes" cambia a "Todo el año" y elegir Cliente limpia "Por pagar"', async ({ page }) => {
  await abrir(page)
  if (esMovil()) {
    await page.getByRole('button', { name: 'Filtros' }).click()
    const hoja = page.getByRole('dialog', { name: 'Filtros' })
    await hoja.getByRole('button', { name: /^Pendientes/ }).click()
    await expect(page).toHaveURL(/mes=todo/)
    await hoja.getByRole('button', { name: 'Por pagar' }).click()
    await hoja.getByRole('button', { name: 'Todos los clientes' }).click()
    await hoja.getByRole('radio', { name: 'Liverpool' }).click()
    await expect(page).toHaveURL(/cliente=Liverpool/)
    await expect(page).not.toHaveURL(/tipo=pago/)
    await hoja.getByRole('button', { name: /^Ver / }).click()
  } else {
    await page.getByRole('button', { name: 'Filtros' }).click()
    const panel = page.getByRole('dialog', { name: 'Filtros' })
    await panel.getByRole('radio', { name: /Pendientes/ }).click()
    await expect(page).toHaveURL(/mes=todo/)
    await panel.getByRole('radio', { name: 'Por pagar' }).click()
    await expect(page).toHaveURL(/tipo=pago/)
    await panel.getByRole('radio', { name: 'Liverpool' }).click()
    await expect(page).toHaveURL(/cliente=Liverpool/)
    await expect(page).not.toHaveURL(/tipo=pago/)
    await panel.getByRole('button', { name: 'Listo' }).click()
  }
  // Chips removibles de los filtros activos.
  await expect(page.getByRole('button', { name: 'Quitar Estado' }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Quitar Cliente' }).first().click()
  await expect(page).not.toHaveURL(/cliente=/)
})

test('Lista de conceptos agrupada por mes en "Todo el año", con "Sin fecha" al final', async ({ page }) => {
  await abrir(page, '/cuentas?anio=2026&mes=todo&vista=lista')
  await expect(page.getByText('Julio 2026').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('Sin fecha').filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(/Mostrando .* conceptos? de \d+ proyectos?/).filter({ visible: true }).first()).toBeVisible()
})

test('cambiar de año abre el último mes con datos (S16) y el año archivado se ve cerrado', async ({ page }) => {
  await abrir(page)
  if (esMovil()) {
    await page.getByRole('button', { name: /^Periodo:/ }).click()
    await page.getByRole('dialog', { name: 'Periodo' }).getByRole('combobox', { name: 'Año' }).selectOption('2024')
    await page.getByRole('dialog', { name: 'Periodo' }).getByRole('button', { name: 'Cerrar' }).click()
    await expect(page.getByRole('button', { name: 'Periodo: Noviembre 2024' })).toBeVisible()
  } else {
    await page.getByRole('combobox', { name: 'Año' }).selectOption('2024')
    await expect(page.getByText('Noviembre 2024 · 1 proyecto')).toBeVisible()
  }
  await expect(page.getByRole('button', { name: 'Abrir Convención Anual' })).toContainText('Cerrada')
})

test('búsqueda sin resultados muestra el estado vacío', async ({ page }) => {
  await abrir(page)
  if (esMovil()) {
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByPlaceholder('Buscar proyecto, cliente o concepto').fill('zzz')
  } else {
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByPlaceholder('Buscar').fill('zzz')
  }
  await expect(page.getByText('Sin cuentas en este periodo con estos filtros.')).toBeVisible()
})
