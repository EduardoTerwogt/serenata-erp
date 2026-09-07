import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectoDetallePMSinTipo } from '../utils/proyectos-pm-mocks'

const PROYECTO_ID = 'SH300'

test('detalle de proyecto: prompt de asignación de tipo aparece en los tabs nuevos y no en Información', async ({ page }) => {
  await mockProyectoDetallePMSinTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await expect(page.getByRole('heading', { name: 'Spot Verano E2E' })).toBeVisible()

  // "Información" es el tab default -- no debe mostrar el prompt de tipo.
  await expect(page.getByText('¿Qué tipo de proyecto es este?')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar Cambios' })).toBeVisible()

  // El primer <select> de la página sigue siendo el de `estado` (contrato
  // del e2e crítico existente) -- el EtapaSelector solo aparece una vez
  // asignado un tipo.
  await expect(page.locator('select').first()).toHaveValue('PREPRODUCCION')

  await page.getByRole('button', { name: 'Tablero de tareas' }).click()
  await expect(page.getByText('¿Qué tipo de proyecto es este?')).toBeVisible()

  await page.locator('select').filter({ hasText: 'Selecciona un tipo...' }).selectOption({ label: 'Grabación' })

  const [asignarRequest] = await Promise.all([
    page.waitForRequest((req) => req.url().includes(`/api/proyectos/${PROYECTO_ID}/tipo`) && req.method() === 'PUT'),
    page.getByRole('button', { name: 'Asignar' }).click(),
  ])
  expect(asignarRequest.postDataJSON()).toHaveProperty('tipo_proyecto_id')

  await expect(page.getByText('¿Qué tipo de proyecto es este?')).not.toBeVisible()
  await expect(page.getByText('Tablero de tareas -- próximamente')).toBeVisible()
  await expect(page.getByText('Preproducción').first()).toBeVisible()
})
