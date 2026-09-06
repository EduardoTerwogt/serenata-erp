import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export const TEMPLATE_E2E_ID = 'tmpl-e2e-list-1'

interface ServiceTemplateItemMock {
  categoria: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  x_pagar: number
  responsable_nombre: string | null
  responsable_id: string | null
  producto_id: string | null
}

interface ServiceTemplateMock {
  id: string
  nombre: string
  descripcion: string | null
  items: ServiceTemplateItemMock[]
  activo: boolean
  created_at: string
  updated_at: string
}

export async function mockServiceTemplatesApis(page: Page) {
  const template: ServiceTemplateMock = {
    id: TEMPLATE_E2E_ID,
    nombre: 'Low Clika',
    descripcion: 'Paquete básico',
    items: [
      { categoria: 'Producción', descripcion: 'Backline', cantidad: 1, precio_unitario: 3000, x_pagar: 1500, responsable_nombre: null, responsable_id: null, producto_id: null },
    ],
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  const templates: ServiceTemplateMock[] = [template]
  let duplicateCounter = 0

  await page.route('**/api/service-templates', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { nombre: string; descripcion?: string | null; items?: ServiceTemplateItemMock[] }
      duplicateCounter += 1
      const created: ServiceTemplateMock = {
        id: `tmpl-e2e-new-${duplicateCounter}`,
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        items: body.items ?? [],
        activo: true,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      }
      templates.push(created)
      await fulfillJson(route, created, 201)
      return
    }
    await fulfillJson(route, templates)
  })

  await page.route(`**/api/service-templates/${TEMPLATE_E2E_ID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      const index = templates.findIndex((t) => t.id === TEMPLATE_E2E_ID)
      if (index >= 0) templates.splice(index, 1)
      await fulfillJson(route, { ok: true })
      return
    }
    await fulfillJson(route, template)
  })

  await page.route('**/api/proveedores', async (route) => {
    await fulfillJson(route, [])
  })
}
