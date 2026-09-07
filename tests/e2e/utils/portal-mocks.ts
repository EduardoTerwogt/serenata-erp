import { Page } from '@playwright/test'
import { fulfillJson } from './http'

// Fase 5.5 -- mismo patrón que cuentas-mocks.ts: se intercepta a nivel de
// `/api/...` en el navegador (Playwright page.route), sin tocar Supabase/
// Drive/Anthropic reales -- estos e2e prueban el flujo de UI, la lógica de
// cada endpoint ya está cubierta por los tests unitarios en app/api/__tests__.

export async function mockPortalSignupSinMatch(page: Page) {
  await page.route('**/api/portal/signup', async (route) => {
    await fulfillJson(route, { success: true, requiere_confirmacion: false, candidatos: [] })
  })
}

/**
 * A diferencia de mockPortalSignupSinMatch, este caso necesita que
 * /api/portal/me cambie de respuesta a mitad del test (pendiente de
 * confirmación -> activo, tras confirmar) -- por eso queda con estado
 * propio en vez de componerse con mockPortalDashboard.
 */
export async function mockPortalSignupConMatch(page: Page) {
  let confirmado = false

  await page.route('**/api/portal/signup', async (route) => {
    await fulfillJson(route, {
      success: true,
      requiere_confirmacion: true,
      candidatos: [{ id: 'cand-1', nombre: 'Antonio Gutierrez', score: 0.5 }],
    })
  })

  await page.route('**/api/portal/me', async (route) => {
    if (!confirmado) {
      await fulfillJson(route, {
        id: 'nuevo-1',
        nombre: 'Jose Gutierrez',
        correo: 'jose@correo.com',
        portal_estado: 'pendiente_confirmacion',
        candidato: { id: 'cand-1', nombre: 'Antonio Gutierrez' },
      })
      return
    }
    await fulfillJson(route, {
      id: 'cand-1',
      nombre: 'Antonio Gutierrez',
      correo: 'jose@correo.com',
      portal_estado: 'activo',
      candidato: null,
    })
  })

  await page.route('**/api/portal/signup/confirmar', async (route) => {
    confirmado = true
    await fulfillJson(route, { success: true, proveedor: { id: 'cand-1', nombre: 'Antonio Gutierrez' } })
  })

  await page.route('**/api/portal/cuentas', async (route) => {
    await fulfillJson(route, { cuentas: [] })
  })
}

export async function mockPortalDashboard(page: Page, overrides: { cuentas?: unknown[] } = {}) {
  await page.route('**/api/portal/me', async (route) => {
    await fulfillJson(route, {
      id: 'prov-1',
      nombre: 'Antonio Gutierrez',
      correo: 'antonio@correo.com',
      portal_estado: 'activo',
      candidato: null,
    })
  })

  await page.route('**/api/portal/cuentas', async (route) => {
    await fulfillJson(route, {
      cuentas: overrides.cuentas ?? [
        {
          id: 'cuenta-1',
          proyecto_nombre: 'Spot Verano',
          item_descripcion: 'Audio en vivo',
          x_pagar: 1000,
          estado: 'PENDIENTE',
          monto_pagado: 0,
          saldo_pendiente: 1000,
          fecha_factura: null,
        },
      ],
    })
  })
}

export async function mockPortalFacturaBloqueada(page: Page) {
  await page.route('**/api/portal/cuentas/*/factura', async (route) => {
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
  await page.route('**/api/portal/cuentas/*/factura', async (route) => {
    await fulfillJson(route, { success: true })
  })
}
