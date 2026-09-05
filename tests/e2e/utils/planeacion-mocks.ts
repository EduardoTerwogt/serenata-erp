import { Page } from '@playwright/test'
import { fulfillJson } from './http'

export const PLANEACION_TEMPLATE_ID = 'tmpl-e2e-1'
export const PLANEACION_PENDIENTE_ID = 'pend-e2e-1'

const templates = [
  {
    id: PLANEACION_TEMPLATE_ID,
    nombre: 'Suena la Ciudad',
    descripcion: 'Paquete estándar',
    items: [
      { categoria: 'Producción', descripcion: 'Renta de equipo', cantidad: 1, precio_unitario: 5000, x_pagar: 2000, responsable_nombre: null, responsable_id: null, producto_id: null },
    ],
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

let createdQuotationCount = 0

export async function mockPlaneacionExtractionApis(page: Page) {
  await page.route('**/api/clientes**', async (route) => {
    await fulfillJson(route, [{ nombre: 'Estudio Manantial', proyectos: [] }])
  })

  await page.route('**/api/planeacion/extract-ai', async (route) => {
    await fulfillJson(route, {
      events: [
        {
          raw: '8 abril CDMX Aragón Fes Aragón',
          fecha: '8 abril',
          locacion: 'Aragón',
          ciudad: 'CDMX',
          proyecto: 'Fes Aragón',
          action: 'confirmado',
          notas: null,
          confidence: 0.9,
        },
      ],
      notasContextuales: {},
    })
  })

  await page.route('**/api/planeacion/match', async (route) => {
    await fulfillJson(route, { quotation: null, reason: null })
  })

  await page.route('**/api/planeacion/usage', async (route) => {
    await fulfillJson(route, {
      tokensUsed: 100,
      tokensAvailable: 100000,
      percentageUsed: 0.1,
      costUSD: 0.01,
      eventsProcessed: 1,
    })
  })

  await page.route('**/api/service-templates', async (route) => {
    await fulfillJson(route, templates)
  })

  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() === 'POST') {
      createdQuotationCount += 1
      const id = `SH-E2E-${createdQuotationCount}`
      await fulfillJson(route, { id, items: [] }, 201)
      return
    }
    await fulfillJson(route, [])
  })

  await page.route('**/api/planeacion/save-notes', async (route) => {
    await fulfillJson(route, { success: true })
  })

  await page.route('**/api/planeacion/pendientes', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, { success: true })
      return
    }
    await fulfillJson(route, { pendientes: [] })
  })
}

export async function mockPlaneacionPendientesApis(page: Page) {
  const pendiente = {
    id: PLANEACION_PENDIENTE_ID,
    fecha: '2026-05-20',
    fecha_iso: '2026-05-20',
    ciudad: 'Monterrey',
    locacion: 'Arena MTY',
    raw_input: '20 mayo Monterrey Arena MTY',
    estado: 'por_confirmar' as const,
    notas: null,
    cliente: 'Agencia Punto Norte',
    proyecto: 'Evento Corporativo E2E',
  }

  await page.route('**/api/planeacion/pendientes/**', async (route) => {
    if (route.request().method() === 'DELETE') {
      await fulfillJson(route, { success: true })
      return
    }
    await route.fallback()
  })

  await page.route('**/api/planeacion/pendientes', async (route) => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, { pendientes: [pendiente] })
      return
    }
    await fulfillJson(route, { success: true })
  })

  await page.route('**/api/service-templates', async (route) => {
    await fulfillJson(route, templates)
  })

  await page.route('**/api/cotizaciones', async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, { id: 'SH-E2E-PEND-1', items: [] }, 201)
      return
    }
    await fulfillJson(route, [])
  })
}
