import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { liveEnabled } from '../utils/live-helpers'

/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, O1b, S4): presupuesto de p95 < 800 ms
 * de las lecturas nuevas contra serenata-erp-test, que trae el dataset de
 * carga (≈2,200 proyectos y ≈13,000 conceptos en un año). Solo lee.
 *
 * Mide del lado del cliente la petición completa (RPC + derivación en TS +
 * respuesta). Si no se cumple, el plan pide pasar la derivación a SQL con un
 * test de paridad (O1b); el número queda en el log para decidir con datos.
 */

const PRESUPUESTO_MS = 800
const MUESTRAS = 12

function p95(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  return orden[Math.min(orden.length - 1, Math.ceil(orden.length * 0.95) - 1)]
}

test.describe('live: rendimiento de la lectura por periodo', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')
  test.setTimeout(180_000)

  const casos = [
    ['periodo (mes)', '/api/cuentas/periodo?mes=9'],
    ['periodo (todo el año)', '/api/cuentas/periodo?mes=todo'],
    ['periodo (lista, pendientes)', '/api/cuentas/periodo?mes=todo&vista=lista&estado=pendientes'],
    ['resumen', '/api/cuentas/resumen'],
  ] as const

  for (const [nombre, url] of casos) {
    test(`${nombre}: p95 < ${PRESUPUESTO_MS} ms`, async ({ page }) => {
      await login(page, '/cuentas')

      // Calentamiento: la primera petición compila/abre conexiones.
      for (let i = 0; i < 2; i++) expect((await page.request.get(url)).ok()).toBe(true)

      const tiempos: number[] = []
      for (let i = 0; i < MUESTRAS; i++) {
        const inicio = Date.now()
        const res = await page.request.get(url)
        await res.body()
        tiempos.push(Date.now() - inicio)
        expect(res.ok()).toBe(true)
      }
      const valor = p95(tiempos)
      console.log(`[O1b] ${nombre}: p95 ${valor} ms (muestras: ${tiempos.join(', ')})`)
      expect(valor).toBeLessThan(PRESUPUESTO_MS)
    })
  }
})
