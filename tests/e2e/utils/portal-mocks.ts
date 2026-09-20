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

const PERFIL_DEFAULT: { nombre: string; telefono: null; banco: null; clabe: null; regimen_fiscal: 'moral' | 'fisica' | null } = {
  nombre: 'Antonio Gutierrez',
  telefono: null,
  banco: null,
  clabe: null,
  regimen_fiscal: null,
}

export async function mockPortalDashboard(
  page: Page,
  overrides: { grupos?: unknown[]; documentos?: unknown[]; perfil?: Partial<typeof PERFIL_DEFAULT> } = {}
) {
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
    await fulfillJson(route, { ...PERFIL_DEFAULT, ...overrides.perfil })
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

// Mismatch de SUBTOTAL -- el wrapper del Portal (lib/server/portal/factura-mensaje-proveedor.ts)
// muestra ambos montos (XML vs. esperado) e invita a contactar a Serenata
// si el esperado está mal, sin `ejemplo` (ya redundante con el panel
// "Simulador de factura", siempre visible).
export async function mockPortalFacturaBloqueada(page: Page) {
  await page.route('**/api/portal/cuentas/grupos/*/factura', async (route) => {
    await fulfillJson(
      route,
      { error: 'El Subtotal de tu factura es de $900.00 y lo correspondiente al proyecto es $1000.00. Si el subtotal de Serenata está mal, ponte en contacto con nosotros.' },
      422
    )
  })
}

// Mismatch de RETENCIONES (IVA y/o ISR retenido) -- el wrapper del Portal
// lo vuelve un mensaje genérico de régimen fiscal, sin `ejemplo` (remite al
// panel "Simulador de factura" en su lugar).
export async function mockPortalFacturaRegimenIncorrecto(page: Page) {
  await page.route('**/api/portal/cuentas/grupos/*/factura', async (route) => {
    await fulfillJson(
      route,
      { error: 'Los impuestos aplicados no corresponden a tu régimen fiscal. En el simulador de factura (panel lateral) puedes ver el desglose esperado de tu factura acorde a tu régimen.' },
      422
    )
  })
}

// Mismatch de DESGLOSE (subtotal correcto) -- sigue mostrando el mensaje
// específico y el `ejemplo`, igual que antes del wrapper.
export async function mockPortalFacturaDesgloseIncorrecto(page: Page) {
  await page.route('**/api/portal/cuentas/grupos/*/factura', async (route) => {
    await fulfillJson(
      route,
      {
        error: 'IVA trasladado no coincide: XML $0.00 vs esperado $160.00 (16% del subtotal).',
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

// Bug real (2026-09-19): tras subir una factura con éxito, el cliente no
// recargaba /api/portal/cuentas -- el grupo recién facturado seguía
// apareciendo seleccionable en el formulario. Este mock simula la
// transición real de estado en el servidor (ABIERTO/facturable ->
// FACTURADO/no facturable) para probar que el cliente sí vuelve a pedir
// /api/portal/cuentas después del 200 y refleja el cambio, tanto en el
// <select> como en la tabla de historial. Self-contained (no se compone
// con mockPortalDashboard) porque /api/portal/cuentas necesita cambiar de
// respuesta a mitad del test, igual que mockPortalDashboardConMatch.
export async function mockPortalDashboardFacturaExitosa(page: Page) {
  let facturado = false

  await page.route('**/api/portal/me', async (route) => {
    await fulfillJson(route, { id: 'prov-1', nombre: 'Antonio Gutierrez', correo: 'antonio@correo.com', portal_estado: 'activo', candidato: null })
  })

  await page.route('**/api/portal/perfil', async (route) => {
    await fulfillJson(route, PERFIL_DEFAULT)
  })

  await page.route('**/api/portal/documentos', async (route) => {
    await fulfillJson(route, { documentos: [] })
  })

  await page.route('**/api/portal/cuentas', async (route) => {
    await fulfillJson(route, {
      grupos: [
        {
          id: 'grupo-1',
          es_grupo: true,
          facturable: !facturado,
          proyecto_id: 'SH001',
          proyecto_nombre: 'Spot Verano',
          estado: facturado ? 'FACTURADO' : 'ABIERTO',
          monto_total: 1000,
          monto_pagado: 0,
          saldo_pendiente: 1000,
          items: [{ id: 'cuenta-1', item_descripcion: 'Audio en vivo', cantidad: 1, x_pagar: 1000, cotizacion_id: 'SH001' }],
        },
      ],
    })
  })

  await page.route('**/api/portal/cuentas/grupos/*/factura', async (route) => {
    facturado = true
    await fulfillJson(route, { success: true })
  })
}

// Punto 3 (2026-09-20): "Mis documentos" antes solo dejaba "Subir otro",
// nunca borrar uno ya subido. Self-contained (mismo motivo que
// mockPortalDashboardFacturaExitosa): /api/portal/documentos necesita
// cambiar de respuesta a mitad del test, antes/después del DELETE.
export async function mockPortalDocumentosConBorrado(page: Page) {
  let documentos = [
    { id: 'doc-ine', proveedor_id: 'prov-1', tipo: 'INE', archivo_url: 'https://drive.google.com/file/d/abc/view', archivo_nombre: 'ine.jpg', estado_validacion: 'pendiente' },
    { id: 'doc-constancia', proveedor_id: 'prov-1', tipo: 'CONSTANCIA_SITUACION_FISCAL', archivo_url: 'https://drive.google.com/file/d/def/view', archivo_nombre: 'constancia.pdf', estado_validacion: 'validado' },
  ]

  await page.route('**/api/portal/me', async (route) => {
    await fulfillJson(route, { id: 'prov-1', nombre: 'Antonio Gutierrez', correo: 'antonio@correo.com', portal_estado: 'activo', candidato: null })
  })

  await page.route('**/api/portal/perfil', async (route) => {
    await fulfillJson(route, PERFIL_DEFAULT)
  })

  await page.route('**/api/portal/cuentas', async (route) => {
    await fulfillJson(route, { grupos: [] })
  })

  await page.route('**/api/portal/documentos', async (route) => {
    await fulfillJson(route, { documentos })
  })

  await page.route('**/api/portal/documentos/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    const id = route.request().url().split('/').pop()
    const doc = documentos.find(d => d.id === id)
    if (doc?.estado_validacion === 'validado') {
      await fulfillJson(route, { error: 'Este documento ya fue validado -- contacta a Serenata si necesitas reemplazarlo' }, 409)
      return
    }
    documentos = documentos.filter(d => d.id !== id)
    await fulfillJson(route, { success: true })
  })
}
