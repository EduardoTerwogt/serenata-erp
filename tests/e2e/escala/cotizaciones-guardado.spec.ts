import { test, expect } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacionesByPrefix } from '../utils/live-cleanup'
import { liveEnabled } from '../utils/live-helpers'

/**
 * K6 (docs/archive/simplificacion-modelo-datos.md): latencia de guardar una cotización.
 * Mide del lado del cliente `POST /api/cotizaciones` (alta de un borrador de 5 partidas) y
 * `PUT /api/cotizaciones/:id` (guardado completo del formulario), contra serenata-erp-test.
 * Aparte del gate de PR, como el resto de `escala`: mide latencia en una BD compartida
 * y un pico ajeno no debe tumbar un PR. Deja p50, p95 y el Server-Timing en el log para
 * decidir con datos; el presupuesto es el mismo p95 < 800 ms de las lecturas de Cuentas.
 */

const PRESUPUESTO_MS = 800
const MUESTRAS = 20
const CALENTAMIENTO = 3
const PREFIJO = 'E2E-ESCALA-GUARDADO-'

const items = (n: number, variante: number) => Array.from({ length: n }, (_, i) => ({
  categoria: 'Equipo',
  descripcion: `Partida ${i} v${variante}`,
  cantidad: 1,
  precio_unitario: 1000 + i * 100 + variante,
  costo_unitario: 500,
  orden: i,
}))

function percentil(valores: number[], p: number): number {
  const orden = [...valores].sort((a, b) => a - b)
  return orden[Math.min(orden.length - 1, Math.max(0, Math.ceil(orden.length * p) - 1))]
}

test.describe('live: latencia de guardado de cotizaciones (K6)', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')
  test.setTimeout(300_000)

  test.afterAll(async () => {
    await cleanupLiveCotizacionesByPrefix(PREFIJO)
  })

  test(`POST y PUT /api/cotizaciones: p95 < ${PRESUPUESTO_MS} ms`, async ({ page }) => {
    await login(page, '/cotizaciones')

    const post: number[] = []
    const put: number[] = []
    const ids: string[] = []

    for (let i = 0; i < CALENTAMIENTO + MUESTRAS; i++) {
      const inicio = Date.now()
      const res = await page.request.post('/api/cotizaciones', {
        data: { cliente: `${PREFIJO}${i}`, proyecto: `Guardado ${i}`, items: items(5, 0) },
      })
      const ms = Date.now() - inicio
      expect(res.status(), await res.text()).toBe(201)
      ids.push((await res.json() as { id: string }).id)
      if (i >= CALENTAMIENTO) post.push(ms)
    }

    for (let i = 0; i < CALENTAMIENTO + MUESTRAS; i++) {
      const id = ids[i]
      const inicio = Date.now()
      const res = await page.request.put(`/api/cotizaciones/${id}`, {
        data: { cliente: `${PREFIJO}${i}`, proyecto: `Guardado ${i} editado`, items: items(5, 7) },
      })
      const ms = Date.now() - inicio
      expect(res.status(), await res.text()).toBe(200)
      if (i >= CALENTAMIENTO) put.push(ms)
    }

    const resumen = (nombre: string, v: number[]) => {
      const p50 = percentil(v, 0.5)
      const p95 = percentil(v, 0.95)
      console.log(`[K6] ${nombre}: n=${v.length} p50 ${p50} ms, p95 ${p95} ms, máx ${Math.max(...v)} ms (muestras: ${v.join(', ')})`)
      return p95
    }
    expect(resumen('POST /api/cotizaciones (5 partidas)', post)).toBeLessThan(PRESUPUESTO_MS)
    expect(resumen('PUT /api/cotizaciones/:id (5 partidas)', put)).toBeLessThan(PRESUPUESTO_MS)
  })
})
