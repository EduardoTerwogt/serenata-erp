import { Page } from '@playwright/test'
import { fulfillJson } from './http'

// Fase 5.5 -- mismo patrón que cuentas-mocks.ts: se intercepta a nivel de
// `/api/...` en el navegador (Playwright page.route), sin tocar Supabase/
// Drive/Anthropic reales -- esa lógica ya está cubierta por los tests
// unitarios en app/api/__tests__.

export async function mockPortalSignup(page: Page) {
  await page.route('**/api/portal/signup', async (route) => {
    await fulfillJson(route, { success: true })
  })
}

const PERFIL_DEFAULT = { nombre: 'Antonio Gutierrez', telefono: null, banco: null, clabe: null, regimen_fiscal: null }

export async function mockPortalDashboard(page: Page, overrides: { grupos?: unknown[]; documentos?: unknown[] } = {}) {
  await page.route('**/api/portal/me', async (route) => {
    await fulfillJson(route, {
      id: 'prov-1',
      nombre: 'Antonio Gutierrez',
      correo: 'antonio@correo.com',
      portal_estado: 'activo',
      candidato: null,
    })
  })

  await page.route('**/api/portal/perfil', async (route) => {
    await fulfillJson(route, PERFIL_DEFAULT)
  })

  await page.route('**/api/portal/documentos', async (route) => {
    await fulfillJson(route, { documentos: overrides.documentos ?? [] })
  })

  await page.route('**/api/portal/cuentas', async (route) => {
    await fulfillJson(route, {
      grupos: overrides.grupos ?? [
        {
          id: 'grupo-1',
          es_grupo: true,
          facturable: true,
          proyecto_id: 'SH001',
          proyecto_nombre: 'Spot Verano',
          estado: 'ABIERTO',
          monto_total: 1000,
          monto_pagado: 0,
          saldo_pendiente: 1000,
          items: [{ id: 'cuenta-1', item_descripcion: 'Audio en vivo', cantidad: 1, x_pagar: 1000, cotizacion_id: 'SH001' }],
        },
      ],
    })
  })
}

/**
 * El matching se dispara al subir INE/constancia desde la pestaña
 * "Documentación" (no en el signup). /api/portal/me y /api/portal/documentos
 * necesitan cambiar de respuesta a mitad del test (antes/después de subir
 * el documento y de confirmar el match) -- por eso este mock trae su
 * propio estado en vez de componerse con mockPortalDashboard.
 */
export async function mockPortalDashboardConMatch(page: Page) {
  let documentoSubido = false
  let confirmado = false

  await page.route('**/api/portal/me', async (route) => {
    if (confirmado) {
      await fulfillJson(route, { id: 'cand-1', nombre: 'Antonio Gutierrez', correo: 'jose@correo.com', portal_estado: 'activo', candidato: null })
      return
    }
    if (documentoSubido) {
      await fulfillJson(route, {
        id: 'nuevo-1',
        nombre: 'Jose Gutierrez',
        correo: 'jose@correo.com',
        portal_estado: 'pendiente_confirmacion',
        candidato: { id: 'cand-1', nombre: 'Antonio Gutierrez' },
      })
      return
    }
    await fulfillJson(route, { id: 'nuevo-1', nombre: 'Jose Gutierrez', correo: 'jose@correo.com', portal_estado: 'activo', candidato: null })
  })

  await page.route('**/api/portal/perfil', async (route) => {
    await fulfillJson(route, { ...PERFIL_DEFAULT, nombre: 'Jose Gutierrez' })
  })

  await page.route('**/api/portal/documentos', async (route) => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, { documentos: documentoSubido ? [{ id: 'doc-1', tipo: 'INE', archivo_nombre: 'ine.jpg', estado_validacion: 'pendiente' }] : [] })
      return
    }
    documentoSubido = true
    await fulfillJson(route, { success: true, documento: {}, requiere_confirmacion: true })
  })

  await page.route('**/api/portal/cuentas', async (route) => {
    await fulfillJson(route, { grupos: [] })
  })

  await page.route('**/api/portal/signup/confirmar', async (route) => {
    confirmado = true
    await fulfillJson(route, { success: true, proveedor: { id: 'cand-1', nombre: 'Antonio Gutierrez' } })
  })
}

export async function mockPortalFacturaBloqueada(page: Page) {
  await page.route('**/api/portal/cuentas/grupos/*/factura', async (route) => {
    await fulfillJson(
      route,
      {
        error: 'Subtotal no coincide: XML $900.00 vs esperado $1000.00.',
        ejemplo: {
          subtotal: 1000,
          iva_trasladado: 160,
          iva_retenido: 0,
          isr_retenido: 0,
          total: 1160,
          explicacion: 'Como persona moral, tu factura solo lleva el IVA trasladado (16%) sobre el subtotal, sin ninguna retención.',
        },
      },
      422
    )
  })
}

export async function mockPortalFacturaValida(page: Page) {
  await page.route('**/api/portal/cuentas/grupos/*/factura', async (route) => {
    await fulfillJson(route, { success: true })
  })
}
