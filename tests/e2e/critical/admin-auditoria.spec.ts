import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockAdminUsuariosApis, mockAdminAuditoriaApi } from '../utils/admin-usuarios-mocks'

test('Admin muestra las guardas de consistencia en orden', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await login(page, '/admin')

  await expect(page.getByText('Consistencia de datos')).toBeVisible()
  await expect(page.getByText('Todas las guardas en orden.')).toBeVisible()
  await expect(page.getByText('cuentas por cobrar: monto_pagado = Σ pagos vigentes').first()).toBeVisible()
})

test('Admin señala las guardas con falla y sus ejemplos', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await mockAdminAuditoriaApi(page, {
    ejecutado_en: '2026-10-02T09:00:00Z',
    total_violaciones: 2,
    guardas: [
      { clave: 'cp_sin_grupo', descripcion: 'cuenta por pagar con proveedor y sin grupo', violaciones: 2, ejemplos: ['11111111-1111-4111-8111-111111111111'] },
      { clave: 'folio_cc', descripcion: 'folio de cuenta por cobrar nulo o duplicado', violaciones: 0, ejemplos: [] },
    ],
  })
  await login(page, '/admin')

  await expect(page.getByText(/2 fila\(s\) con falla en 1 guarda\(s\)/)).toBeVisible()
  await expect(page.getByText('2 con falla').first()).toBeVisible()
  await expect(page.getByText('11111111-1111-4111-8111-111111111111').first()).toBeVisible()
})
