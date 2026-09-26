import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { liveEnabled } from '../utils/live-helpers'

/**
 * Rediseño de Cuentas B3 (docs/PLAN.md, O1b, S4): presupuesto de p95 < 800 ms
 * de las lecturas nuevas contra serenata-erp-test, que trae el dataset de
 * carga (≈2,200 proyectos y ≈13,000 conceptos en un año). Solo lee.
 *
 * Mide del lado del cliente la petición completa. Con la derivación en TS el
 * año crudo (~4 MB) no cabía en el presupuesto; desde O1b se deriva en SQL
 * (cuentas-paridad-sql.spec.ts vigila que dé lo mismo). El número y el
 * Server-Timing quedan en el log para decidir con datos.
 */

const PRESUPUESTO_MS = 800
// E7 (sesión 20, autorizado por el usuario): con 12 muestras el "p95" era el
// máximo y un solo pico de red lo tumbaba; con 40, es la 38.ª muestra.
const MUESTRAS = 40
// La primera consulta pesada en cada conexión nueva de Postgres cuesta ~300 ms
// más (catálogo en frío, medido en serenata-erp-test) y PostgREST reparte las
// peticiones entre varias conexiones: 2 de calentamiento no alcanzaban.
const CALENTAMIENTO = 8
// Opción A (sesión 21, autorizada por el usuario): la BD de test es compartida
// y sus picos (auth o RPC de 0.8–3 s, varias muestras seguidas) tumbaban el p95
// con la mayoría de las muestras en 420–600 ms. Se mide en dos rondas y cuenta
// la mejor: un pico pasajero no reprueba, una regresión real sí (sube ambas).
const RONDAS = 2

function p95(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b)
  return orden[Math.min(orden.length - 1, Math.ceil(orden.length * 0.95) - 1)]
}

test.describe('live: rendimiento de la lectura por periodo', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')
  test.setTimeout(300_000)

  const casos = [
    ['periodo (mes)', '/api/cuentas/periodo?mes=9'],
    ['periodo (todo el año)', '/api/cuentas/periodo?mes=todo'],
    ['periodo (lista, pendientes)', '/api/cuentas/periodo?mes=todo&vista=lista&estado=pendientes'],
    ['resumen', '/api/cuentas/resumen'],
    ['avisos', '/api/cuentas/avisos'],
  ] as const

  for (const [nombre, url] of casos) {
    test(`${nombre}: p95 < ${PRESUPUESTO_MS} ms`, async ({ page }) => {
      await login(page, '/cuentas')

      // Calentamiento: las primeras peticiones compilan y abren conexiones del pool.
      for (let i = 0; i < CALENTAMIENTO; i++) expect((await page.request.get(url)).ok()).toBe(true)

      const p95s: number[] = []
      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const tiempos: number[] = []
        const fases: string[] = []
        for (let i = 0; i < MUESTRAS; i++) {
          const inicio = Date.now()
          const res = await page.request.get(url)
          await res.body()
          tiempos.push(Date.now() - inicio)
          fases.push(res.headers()['server-timing'] ?? '')
          expect(res.ok()).toBe(true)
        }
        const p95Ronda = p95(tiempos)
        p95s.push(p95Ronda)
        console.log(`[O1b] ${nombre} (ronda ${ronda}): p95 ${p95Ronda} ms (muestras: ${tiempos.join(', ')})`)
        // Desglose del servidor por muestra (auth / rpc / json).
        console.log(`[O1b] ${nombre} (ronda ${ronda}): server-timing ${fases.map((f) => f.replace(/;dur=/g, ' ').replace(/, /g, ' ')).join(' | ')}`)
        if (p95Ronda < PRESUPUESTO_MS) break
      }
      const valor = Math.min(...p95s)
      console.log(`[O1b] ${nombre}: p95 ${valor} ms (mejor de ${p95s.length} ronda(s): ${p95s.join(', ')})`)
      expect(valor).toBeLessThan(PRESUPUESTO_MS)
    })
  }
})
