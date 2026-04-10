import { Page, Route } from '@playwright/test'

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  })
}

export async function mockNuevaCotizacionApis(page: Page) {
  await page.route('**/api/folio', async (route) => {
    await fulfillJson(route, { folio: 'SH123' })
  })

  await page.route('**/api/responsables', async (route) => {
    await fulfillJson(route, [
      {
        id: 'resp-1',
        nombre: 'José García',
        rol: 'Producción',
        email: 'jose@serenata.test',
        telefono: '5555555555',
      },
    ])
  })

  await page.route('**/api/clientes?q=', async (route) => {
    await fulfillJson(route, [
      {
        nombre: 'Walmart México',
        proyectos: ['Show Monterrey'],
      },
    ])
  })

  await page.route('**/api/productos?q=', async (route) => {
    await fulfillJson(route, [
      {
        id: 'prod-1',
        descripcion: 'Backline',
        categoria: 'Producción',
        precio_unitario: 1000,
        x_pagar_sugerido: 700,
      },
    ])
  })
}
