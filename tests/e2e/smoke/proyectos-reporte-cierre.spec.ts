import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { mockProyectoDetallePMConTipo } from '../utils/proyectos-pm-mocks'

const PROYECTO_ID = 'SH304'

test('reporte de cierre: muestra "no disponible" cuando el proyecto no ha cerrado', async ({ page }) => {
  await mockProyectoDetallePMConTipo(page, PROYECTO_ID)
  await login(page, `/proyectos/${PROYECTO_ID}`)

  await page.getByRole('button', { name: 'Reporte de cierre' }).click()
  await expect(page.getByText('No disponible aún -- este reporte se genera automáticamente')).toBeVisible()
})
