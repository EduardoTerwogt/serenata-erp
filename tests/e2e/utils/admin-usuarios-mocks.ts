import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export const ADMIN_USER_E2E_ID = 'user-e2e-1'

export async function mockAdminUsuariosApis(page: Page) {
  const usuario = {
    id: ADMIN_USER_E2E_ID,
    email: 'ana@serenata.test',
    name: 'Ana Pérez',
    sections: ['cotizaciones', 'cuentas'],
    active: true,
    created_at: '2026-01-01T00:00:00Z',
  }

  const usuarios = [usuario]
  let createdCounter = 0

  await page.route('**/api/admin/usuarios', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { email: string; name: string; sections?: string[] }
      createdCounter += 1
      const created = {
        id: `user-e2e-new-${createdCounter}`,
        email: body.email,
        name: body.name,
        sections: body.sections ?? [],
        active: true,
        created_at: '2026-05-01T00:00:00Z',
      }
      usuarios.push(created)
      await fulfillJson(route, created, 201)
      return
    }
    await fulfillJson(route, usuarios)
  })

  await page.route(`**/api/admin/usuarios/${ADMIN_USER_E2E_ID}`, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      Object.assign(usuario, body)
      await fulfillJson(route, usuario)
      return
    }
    await fulfillJson(route, usuario)
  })
}
