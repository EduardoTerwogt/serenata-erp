import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export const PROYECTO_E2E_ID = 'SH200'

export async function mockProyectosApis(page: Page) {
  const proyecto = {
    id: PROYECTO_E2E_ID,
    cliente: 'Cervezas del Bravo',
    proyecto: 'Spot Verano E2E',
    fecha_entrega: '2026-06-15',
    locacion: 'CDMX',
    horarios: '08:00 - 20:00',
    punto_encuentro: 'Estudio Central',
    estado: 'PREPRODUCCION',
    notas: '',
    created_at: '2026-05-01T00:00:00Z',
    ultima_actualizacion: '2026-05-01T00:00:00Z',
    items: [
      {
        id: 'item-e2e-1',
        cotizacion_id: PROYECTO_E2E_ID,
        categoria: 'Producción',
        descripcion: 'Renta de cámara',
        cantidad: 1,
        precio_unitario: 15000,
        importe: 15000,
        responsable_nombre: 'Sofía Ramírez',
        responsable_id: 'resp-1',
        x_pagar: 6000,
        margen: 9000,
        orden: 1,
        notas: null,
      },
    ],
  }

  const proyectos = [proyecto]

  await page.route('**/api/proyectos', async (route) => {
    await fulfillJson(route, proyectos)
  })

  await page.route(`**/api/proyectos/${PROYECTO_E2E_ID}`, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      Object.assign(proyecto, {
        estado: body.estado ?? proyecto.estado,
        fecha_entrega: body.fecha_entrega ?? proyecto.fecha_entrega,
        locacion: body.locacion ?? proyecto.locacion,
        horarios: body.horarios ?? proyecto.horarios,
        punto_encuentro: body.punto_encuentro ?? proyecto.punto_encuentro,
        notas: body.notas ?? proyecto.notas,
      })
      await fulfillJson(route, proyecto)
      return
    }
    await fulfillJson(route, proyecto)
  })

  await page.route('**/api/responsables', async (route) => {
    await fulfillJson(route, [
      { id: 'resp-1', nombre: 'Sofía Ramírez', telefono: null, correo: null, banco: null, clabe: null, roles: ['Camarógrafa'], notas: null, activo: true, created_at: '2026-01-01' },
    ])
  })
}
