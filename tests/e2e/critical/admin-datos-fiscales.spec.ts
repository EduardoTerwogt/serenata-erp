import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { fulfillJson } from '../utils/http'
import { CONSTANCIA_E2E, mockAdminDatosFiscalesApi, mockAdminUsuariosApis } from '../utils/admin-usuarios-mocks'

/**
 * #123 (B6a): datos fiscales de Serenata desde su constancia. Se sube el PDF, se lee y valida, el administrador revisa
 * y confirma lo leído y recién entonces se guarda. Nada se guarda sin la confirmación.
 */
const constancia = { name: 'constancia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }

test('muestra la constancia vigente de Serenata y el historial', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await mockAdminDatosFiscalesApi(page, CONSTANCIA_E2E, [CONSTANCIA_E2E, { ...CONSTANCIA_E2E, id: 'df-0', rfc: 'SHO090909XY9', vigente: false, created_at: '2025-01-01T10:00:00Z' }])
  await login(page, '/admin')
  const vigente = page.getByRole('list', { name: 'Constancia vigente' }).or(page.getByLabel('Constancia vigente'))
  await expect(vigente).toContainText('SHO100101AB1')
  await expect(vigente).toContainText('Persona moral')
  await expect(vigente).toContainText('06700')
  await expect(page.getByText('SHO090909XY9')).toBeVisible()
})

test('sin constancia cargada lo dice y que las facturas no se pueden subir', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await mockAdminDatosFiscalesApi(page, null, [])
  await login(page, '/admin')
  await expect(page.getByText(/Todavía no hay constancia cargada: sin ella no se pueden subir facturas/)).toBeVisible()
})

test('subir constancia: se lee, se corrige, se confirma y se guarda', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await mockAdminDatosFiscalesApi(page, null, [])
  let guardado: string | null = null
  await page.route(/\/api\/admin\/datos-fiscales\/leer$/, (route) =>
    fulfillJson(route, {
      datos: { rfc: 'SHO100101AB1', razon_social: 'Serenata House Entertainment S.A. de C.V.', regimen_fiscal: 'Actividades Empresariales y Profesionales', codigo_postal: '06700' },
      validacion: {
        ok: true,
        rfc: 'SHO100101AB1',
        tipo_persona: 'moral',
        errores: [],
        advertencias: ['El RFC tiene 12 posiciones (persona moral) pero el régimen "Actividades Empresariales y Profesionales" es de persona física: revisa que el RFC y el régimen sean de la misma constancia.'],
      },
    })
  )
  await page.route(/\/api\/admin\/datos-fiscales$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    guardado = route.request().postData()
    await fulfillJson(route, { vigente: CONSTANCIA_E2E, advertencias: [] }, 201)
  })
  await login(page, '/admin')

  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(constancia)
  await expect(page.getByText('Revisa lo leído de constancia.pdf')).toBeVisible()
  await expect(page.getByText(/es de persona física: revisa que el RFC y el régimen/)).toBeVisible()
  const guardar = page.getByRole('button', { name: 'Guardar constancia' })
  await expect(guardar).toBeDisabled()

  await page.getByLabel('Régimen fiscal').fill('Régimen General de Ley Personas Morales')
  await page.getByRole('checkbox', { name: 'Confirmo que los datos coinciden con la constancia' }).click()
  await expect(guardar).toBeEnabled()
  await guardar.click()

  await expect(page.getByText(/Constancia guardada\. Desde ahora Cuentas reconoce las facturas/)).toBeVisible()
  expect(guardado).toContain('"confirmado":true')
  expect(guardado).toContain('Régimen General de Ley Personas Morales')
})

test('un RFC inválido se señala y la lectura no se guarda sin confirmar', async ({ page }) => {
  await mockAdminUsuariosApis(page)
  await mockAdminDatosFiscalesApi(page, null, [])
  let intentos = 0
  await page.route(/\/api\/admin\/datos-fiscales\/leer$/, (route) =>
    fulfillJson(route, {
      datos: { rfc: 'ABC123', razon_social: 'Serenata', regimen_fiscal: null, codigo_postal: null },
      validacion: { ok: false, rfc: 'ABC123', tipo_persona: null, errores: ['El RFC "ABC123" no tiene la estructura de un RFC (3 o 4 letras, 6 dígitos de fecha y 3 de homoclave).'], advertencias: [] },
    })
  )
  await page.route(/\/api\/admin\/datos-fiscales$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    intentos++
    await fulfillJson(route, { error: 'constancia_invalida', message: 'El RFC "ABC123" no tiene la estructura de un RFC.' }, 400)
  })
  await login(page, '/admin')
  await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(constancia)
  await expect(page.getByText(/no tiene la estructura de un RFC/).first()).toBeVisible()
  expect(intentos).toBe(0)
  await page.getByRole('checkbox', { name: 'Confirmo que los datos coinciden con la constancia' }).click()
  await page.getByRole('button', { name: 'Guardar constancia' }).click()
  await expect(page.getByText(/no tiene la estructura de un RFC\./).first()).toBeVisible()
  expect(intentos).toBe(1)
})
