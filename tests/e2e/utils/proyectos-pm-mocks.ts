import { Page } from '@playwright/test'
import { fulfillJson } from './http'
import { PROYECTO_E2E_ID } from './proyectos-mocks'

export const TIPO_GRABACION_ID = 'tipo-grabacion-e2e'
export const ETAPA_PREPROD_ID = 'etapa-preprod-e2e'
export const ETAPA_RODAJE_ID = 'etapa-rodaje-e2e'

export function buildTipoGrabacion() {
  return {
    id: TIPO_GRABACION_ID,
    nombre: 'Grabación',
    activo: true,
    created_at: '2026-01-01T00:00:00Z',
    etapas: [
      { id: ETAPA_PREPROD_ID, tipo_proyecto_id: TIPO_GRABACION_ID, nombre: 'Preproducción', orden: 1, es_etapa_final: false, created_at: '2026-01-01T00:00:00Z' },
      { id: ETAPA_RODAJE_ID, tipo_proyecto_id: TIPO_GRABACION_ID, nombre: 'Rodaje', orden: 2, es_etapa_final: false, created_at: '2026-01-01T00:00:00Z' },
    ],
  }
}

// Mocks para la pantalla "Tipos de proyecto" (Fase 5.2 Bloque 3.2) --
// complementa mockProyectosApis (proyectos-mocks.ts) con /api/tipos-proyecto
// y sus sub-rutas de etapas.
export async function mockTiposProyectoApis(page: Page) {
  const tipos = [buildTipoGrabacion()]

  await page.route('**/api/proyectos', async (route) => {
    await fulfillJson(route, [
      { id: PROYECTO_E2E_ID, cliente: 'Cervezas del Bravo', proyecto: 'Spot Verano E2E', estado: 'PREPRODUCCION', tipo_proyecto_id: TIPO_GRABACION_ID, etapa_id: ETAPA_PREPROD_ID, created_at: '2026-01-01T00:00:00Z' },
    ])
  })

  await page.route('**/api/tipos-proyecto', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { nombre: string }
      const nuevo = { id: 'tipo-nuevo-e2e', nombre: body.nombre, activo: true, created_at: '2026-01-01T00:00:00Z', etapas: [] }
      tipos.push(nuevo)
      await fulfillJson(route, nuevo, 201)
      return
    }
    await fulfillJson(route, tipos)
  })

  await page.route(`**/api/tipos-proyecto/${TIPO_GRABACION_ID}/etapas/${ETAPA_PREPROD_ID}`, async (route) => {
    await fulfillJson(route, tipos[0].etapas[0])
  })

  await page.route(`**/api/tipos-proyecto/${TIPO_GRABACION_ID}/etapas/${ETAPA_RODAJE_ID}`, async (route) => {
    await fulfillJson(route, tipos[0].etapas[1])
  })

  await page.route(`**/api/tipos-proyecto/${TIPO_GRABACION_ID}/etapas`, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { nombre: string; orden: number; es_etapa_final?: boolean }
      const nueva = { id: 'etapa-nueva-e2e', tipo_proyecto_id: TIPO_GRABACION_ID, nombre: body.nombre, orden: body.orden, es_etapa_final: body.es_etapa_final ?? false, created_at: '2026-01-01T00:00:00Z' }
      tipos[0].etapas.push(nueva)
      await fulfillJson(route, nueva, 201)
      return
    }
    await fulfillJson(route, tipos[0].etapas)
  })

  return { tipos }
}
