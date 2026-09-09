import { Page } from '@playwright/test'
import { fulfillJson } from './http'
import { CotizacionCreateSchema } from '@/lib/validation/schemas'

/**
 * Valida un payload de cotización con el MISMO schema que usa el servidor. Los mocks
 * respondían 200 a todo, así que un borrador que producción rechazaría con 400 pasaba
 * las pruebas sin más: así se coló un autoguardado que nunca llegaba a guardar.
 */
export function assertPayloadValido(body: unknown, etiqueta: string) {
  const parsed = CotizacionCreateSchema.safeParse(body)
  if (!parsed.success) {
    throw new Error(`${etiqueta}: el servidor rechazaría este payload -> ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' | ')}`)
  }
}

export async function mockNuevaCotizacionApis(page: Page) {
  await page.route('**/api/folio', async (route) => {
    await fulfillJson(route, { folio: 'SH123' })
  })

  await page.route('**/api/proveedores', async (route) => {
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
