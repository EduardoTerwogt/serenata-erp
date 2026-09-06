import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export const PROVEEDOR_E2E_ID = 'resp-e2e-1'

interface ProveedorMock {
  id: string
  nombre: string
  telefono: string | null
  correo: string | null
  banco: string | null
  clabe: string | null
  roles: string[]
  notas: string | null
  activo: boolean
  created_at: string
}

export async function mockProveedoresApis(page: Page) {
  const proveedor: ProveedorMock = {
    id: PROVEEDOR_E2E_ID,
    nombre: 'Diego Torres',
    telefono: '5555555555',
    correo: 'diego@serenata.test',
    banco: 'BBVA',
    clabe: '012345678901234567',
    roles: ['Productor'],
    notas: null,
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
  }

  const proveedores: ProveedorMock[] = [proveedor]

  const historial = [
    {
      id: 'hist-e2e-1',
      responsable_id: PROVEEDOR_E2E_ID,
      cotizacion_id: 'SH010',
      proyecto_nombre: 'Documental Raíces',
      cliente: 'Estudio Manantial',
      fecha_evento: '2026-04-10',
      rol_en_proyecto: 'Productor',
      x_pagar: 8000,
      created_at: '2026-04-01T00:00:00Z',
      proyecto_id: 'SH010',
    },
  ]

  await page.route('**/api/proveedores', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as {
        nombre: string
        telefono?: string | null
        correo?: string | null
        banco?: string | null
        clabe?: string | null
        roles?: string[]
        notas?: string | null
      }
      const created = {
        id: 'resp-e2e-new',
        nombre: body.nombre,
        telefono: body.telefono ?? null,
        correo: body.correo ?? null,
        banco: body.banco ?? null,
        clabe: body.clabe ?? null,
        roles: body.roles ?? [],
        notas: body.notas ?? null,
        activo: true,
        created_at: '2026-05-01T00:00:00Z',
      }
      proveedores.push(created)
      await fulfillJson(route, created, 201)
      return
    }
    await fulfillJson(route, proveedores)
  })

  await page.route(`**/api/proveedores/${PROVEEDOR_E2E_ID}`, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      Object.assign(proveedor, body)
      await fulfillJson(route, proveedor)
      return
    }
    await fulfillJson(route, proveedor)
  })

  await page.route(`**/api/proveedores/${PROVEEDOR_E2E_ID}/historial`, async (route) => {
    await fulfillJson(route, historial)
  })

  await page.route('**/api/proveedores/resp-e2e-new', async (route) => {
    await fulfillJson(route, proveedores.find((r) => r.id === 'resp-e2e-new'))
  })

  await page.route('**/api/proveedores/resp-e2e-new/historial', async (route) => {
    await fulfillJson(route, [])
  })
}
