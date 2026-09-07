import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'

function resumenMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    periodo: 'mes',
    periodoActual: { label: 'Marzo 2026', inicio: '2026-03-01', fin: '2026-04-01' },
    kpis: { porCobrar: 125000, porPagar: 48000, cotizacionesAprobadas: 3, cotizacionesBorrador: 2 },
    balance: [{ label: 'Marzo 2026', ingresos: 130000, egresos: 62000 }],
    fiscal: { ingresos: 130000, egresos: 62000, impuestos: 20400, deudas: 48000, utilidadAntesIsr: 68000 },
    cobertura: {
      gastosFijos: [{ id: 'g1', nombre: 'Renta oficina', monto: 15000 }],
      totalGastosFijos: 15000,
      facturado: 130000,
    },
    actividad: { proyectosCreados: 2, cotizacionesAprobadas: 3, proyectosEnCurso: 1 },
    cotizacionesRecientes: [
      { id: 'SH010', proyecto: 'Boda Fernanda & Luis', cliente: 'Fernanda Ruiz', total: 185000, estado: 'APROBADA', created_at: '2026-03-20T00:00:00Z' },
    ],
    fuentesConError: [],
    ...overrides,
  }
}

async function mockDashboard(page: import('@playwright/test').Page, gastosFijos: unknown[] = [
  { id: 'g1', nombre: 'Renta oficina', monto_mensual: 15000, activo: true, created_at: '2026-01-01' },
]) {
  await page.route('**/api/dashboard/resumen*', (route) => {
    const url = new URL(route.request().url())
    const periodo = url.searchParams.get('periodo') || 'mes'
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resumenMock({ periodo })) })
  })
  await page.route('**/api/dashboard/gastos-fijos', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gastosFijos) })
    }
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'g2', nombre: 'Software', monto_mensual: 500, activo: true, created_at: '2026-03-01' }),
      })
    }
    return route.continue()
  })
}

test('el dashboard carga KPIs, cambia de periodo, agrega un gasto fijo y navega a una cotización', async ({ page }) => {
  await mockDashboard(page)
  await login(page, '/dashboard')

  await expect(page.getByText('$125,000')).toBeVisible()
  await expect(page.getByText('Balance por periodo')).toBeVisible()

  // Cambiar de periodo -- dispara un nuevo fetch con el periodo distinto.
  const resumenRequest = page.waitForResponse((res) => res.url().includes('/api/dashboard/resumen') && res.url().includes('periodo=anio'))
  await page.locator('select').first().selectOption('anio')
  await resumenRequest

  // Agregar gasto fijo desde el modal.
  await page.getByRole('button', { name: 'Agregar gasto fijo' }).click()
  await page.getByPlaceholder('Renta, nómina...').fill('Software')
  await page.locator('input[type="number"]').first().fill('500')
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.getByText('Software')).toBeVisible()

  await page.getByRole('button', { name: /Cerrar/i }).click()

  // Navegar a una cotización reciente.
  await page.getByText('Boda Fernanda & Luis').first().click()
  await expect(page).toHaveURL(/\/cotizaciones\/SH010/)
})
