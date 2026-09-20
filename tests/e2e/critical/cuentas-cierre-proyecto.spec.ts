import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockCuentasApis } from '../utils/cuentas-mocks'

// Bloque 2 (docs/PLAN.md): chip "Utilidad" en el acordeón de la vista "Por
// proyecto" + sección "Cierre del proyecto" (Quién/Cuánto/Cuándo). Los
// montos del mock (mockCuentasApis) usan margen_total_proyecto=2000,
// fee_agencia_proyecto=1000 -> utilidad_bruta=3000, isr_estimado=900 (30%),
// utilidad_neta=2100; el proveedor (regimen null=moral, x_pagar=7500) sin
// retenciones -> total_a_transferir = 7500 + 16% = 8700.
test('vista Por proyecto: chip de Utilidad y sección Cierre del proyecto', async ({ page }) => {
  await mockCuentasApis(page)
  await login(page, '/cuentas')

  // Vista "Por proyecto" es la default (Fase 5.3 Bloque 3) -- el primer
  // proyecto arranca abierto (useState inicial en CuentasPorProyecto), y el
  // chip "Utilidad" vive en el header (button) del acordeón.
  const header = page.getByRole('button', { name: /SH054/ })
  await expect(header.getByText('$2,100.00')).toBeVisible()

  await expect(page.getByText('Cierre del proyecto (estimado)')).toBeVisible()
  await expect(page.getByRole('cell', { name: '$8,700.00' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Día 17 del mes siguiente' })).toBeVisible()
  await expect(page.getByText('Utilidad Bruta')).toBeVisible()
  await expect(page.getByText('ISR estimado de Serenata (30%)')).toBeVisible()
  await expect(page.getByText('Utilidad Neta (estimada)')).toBeVisible()
})
