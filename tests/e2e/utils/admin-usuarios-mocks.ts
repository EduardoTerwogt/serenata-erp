import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export const ADMIN_USER_E2E_ID = 'user-e2e-1'

/** B7: resultado de `auditar_consistencia()` con todas las guardas en orden. */
export const AUDITORIA_E2E_OK = {
  ejecutado_en: '2026-10-02T09:00:00Z',
  total_violaciones: 0,
  guardas: [
    { clave: 'cobro_pagado', descripcion: 'cuentas por cobrar: monto_pagado = Σ pagos vigentes', violaciones: 0, ejemplos: [] },
    { clave: 'folio_cp', descripcion: 'folio de cuenta por pagar nulo o duplicado', violaciones: 0, ejemplos: [] },
  ],
}

export async function mockAdminAuditoriaApi(page: Page, resultado: unknown = AUDITORIA_E2E_OK) {
  await page.route('**/api/admin/auditoria', async (route) => {
    await fulfillJson(route, resultado)
  })
}

export const CONSTANCIA_E2E = {
  id: 'df-1',
  rfc: 'SHO100101AB1',
  razon_social: 'Serenata House Entertainment S.A. de C.V.',
  regimen_fiscal: 'Régimen General de Ley Personas Morales',
  tipo_persona: 'moral',
  codigo_postal: '06700',
  constancia_url: 'https://drive.test/constancia.pdf',
  constancia_nombre: 'constancia.pdf',
  vigente: true,
  actualizado_por: 'ana@serenata.test',
  created_at: '2026-10-01T10:00:00Z',
}

/** #123 (B6a): datos fiscales de Serenata (GET de la vigente y el historial; leer y guardar los define cada spec). */
export async function mockAdminDatosFiscalesApi(page: Page, vigente: unknown = CONSTANCIA_E2E, historial: unknown[] = vigente ? [vigente] : []) {
  await page.route(/\/api\/admin\/datos-fiscales$/, async (route) => {
    if (route.request().method() === 'GET') return fulfillJson(route, { vigente, historial })
    return route.fallback()
  })
}

export async function mockAdminUsuariosApis(page: Page) {
  await mockAdminAuditoriaApi(page)
  await mockAdminDatosFiscalesApi(page)
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
