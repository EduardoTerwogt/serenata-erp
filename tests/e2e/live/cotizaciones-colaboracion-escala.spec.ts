import { test, expect, BrowserContext, Page } from '@playwright/test'
import { getPlaywrightCredentials, login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, cleanupOrphanedFolioReservations, cleanupOrphanedTestProductos } from '../utils/live-cleanup'
import { faltantesDelEntornoLive, leerCotizacionDelServidor, liveEnabled } from '../utils/live-helpers'
import { cleanupLiveUser, ensureLiveUser, LiveUserSeed } from '../utils/live-users'

/**
 * Fase 7: la Fase 6 (reabierta) probó el modelo server-authoritative con 2
 * colaboradores (`cotizaciones-colaboracion.spec.ts`). Esta suite escala el
 * mismo tipo de prueba -- N personas editando la MISMA cotización a la vez,
 * cada una un campo distinto -- a 2, 3, 5 y 10 sesiones simultáneas contra
 * Supabase y Realtime de prueba reales, para confirmar que ni el protocolo
 * base/conflict (Postgres) ni Presence (Realtime) se caen o pierden
 * escrituras según crece el número de conexiones concurrentes al mismo
 * canal `cotizacion:{id}`.
 *
 * No es una prueba de carga de infraestructura (no mide throughput ni
 * latencia) -- es correctitud a escala: cada participante escribe un campo
 * que nadie más toca, así que CERO escrituras deberían perderse sin
 * importar cuántos estén conectados. Si algo se pierde, es un defecto de
 * concurrencia real, no una condición de carrera de la prueba.
 */

const PREFIJO = 'E2E-LIVE-ESCALA-'
const MAX_PARTICIPANTES_SEMBRADOS = 9 // + el usuario del entorno = 10 sesiones máx.

const usuariosSembrados: LiveUserSeed[] = Array.from({ length: MAX_PARTICIPANTES_SEMBRADOS }, (_, i) => ({
  email: `e2e-live-escala-${i + 1}@serenata.test`,
  password: `Escala-${i + 1}-Live-2026`,
  name: `Escala ${i + 1}`,
}))

function filas(page: Page) {
  return page.locator('table tbody tr')
}

function descripcionCelda(page: Page, fila: number) {
  return filas(page).nth(fila).locator('td').nth(1).locator('input')
}

function colaborandoAhora(page: Page) {
  return page.getByText('Colaborando ahora', { exact: true }).locator('xpath=following-sibling::div[1]')
}

async function crearCotizacionConNItems(page: Page, n: number, sufijo: string) {
  const response = await page.request.post('/api/cotizaciones', {
    data: {
      cliente: `${PREFIJO}${sufijo}`,
      proyecto: `Escalamiento x${n} ${sufijo}`,
      estado: 'BORRADOR',
      items: Array.from({ length: n }, (_, i) => ({
        categoria: 'Equipo',
        descripcion: `Item inicial ${i}`,
        cantidad: 1,
        precio_unitario: 100 * (i + 1),
        x_pagar: 0,
        orden: i,
      })),
    },
  })
  expect(response.status(), `no se pudo crear la cotización de ${n} items: ${await response.text()}`).toBe(201)
  const body = await response.json() as { id: string }
  return body.id
}

test.describe('live: escalamiento multiusuario', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    if (process.env.PLAYWRIGHT_LIVE_REQUIRED === 'true') {
      expect(faltantesDelEntornoLive(), 'entorno live incompleto').toEqual([])
    }
    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live escala] barrido inicial:', e))
    await cleanupOrphanedFolioReservations().catch((e) => console.error('[live escala] reservas huérfanas:', e))
    await cleanupOrphanedTestProductos().catch((e) => console.error('[live escala] productos huérfanos:', e))
    // Los N-1 participantes extra se siembran UNA sola vez y se reusan en las 4
    // corridas (2/3/5/10) -- crear/borrar usuarios reales en cada corrida solo
    // agregaría tiempo de CI sin cubrir nada nuevo.
    for (const usuario of usuariosSembrados) await ensureLiveUser(usuario)
  })

  test.afterAll(async () => {
    for (const usuario of usuariosSembrados) {
      await cleanupLiveUser(usuario.email).catch((e) => console.error('[live escala] cleanup usuario:', e))
    }
    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live escala] barrido final:', e))
  })

  for (const n of [2, 3, 5, 10]) {
    test(`${n} sesiones simultáneas editan la misma cotización sin perder ningún cambio`, async ({ browser }) => {
      // Login + join de canal + N escrituras concurrentes + reconciliación en
      // todas las pantallas: escala con N, no es fijo como el resto de la suite.
      test.setTimeout(60_000 + n * 20_000)

      const sufijo = `${n}-${Date.now()}`
      const credencialesEntorno = getPlaywrightCredentials()
      const credenciales = [credencialesEntorno, ...usuariosSembrados.slice(0, n - 1)]
      expect(credenciales, `se pidieron ${n} sesiones pero solo hay ${credenciales.length} credenciales disponibles`).toHaveLength(n)

      const contexts: BrowserContext[] = []
      const pages: Page[] = []
      let cotizacionId = ''

      try {
        // N contextos + N logins en paralelo: si se hicieran en serie, N=10
        // agregaría ~10x el tiempo de un solo login sin probar nada distinto.
        await Promise.all(
          credenciales.map(async (cred, i) => {
            const context = await browser.newContext()
            const page = await context.newPage()
            page.on('pageerror', (error) => console.log(`[live escala][n=${n}][u${i}] pageerror: ${error.message}`))
            contexts[i] = context
            pages[i] = page
            await login(page, '/cotizaciones', { email: cred.email, password: cred.password })
          })
        )

        cotizacionId = await crearCotizacionConNItems(pages[0], n, sufijo)

        await Promise.all(pages.map((page) => page.goto(`/cotizaciones/${cotizacionId}`)))
        await Promise.all(pages.map((page) => expect(filas(page)).toHaveCount(n, { timeout: 30_000 })))

        // Presencia: cada pantalla debe terminar viendo a las otras N-1 -- no
        // solo "no estoy solo", el conteo exacto, para que un colaborador que
        // se cae silenciosamente de Presence (el bug real de Fase 6) se note
        // también a esta escala.
        await Promise.all(
          pages.map((page) =>
            expect
              .poll(() => colaborandoAhora(page).locator('span.rounded-pill').count(), {
                timeout: 30_000 + n * 2_000,
                message: `[n=${n}] una pantalla no llegó a ver a las otras ${n - 1} personas en "Colaborando ahora"`,
              })
              .toBe(n - 1)
          )
        )

        // El corazón de la prueba: cada participante i escribe SU PROPIO campo
        // (fila i, descripción) al mismo tiempo que todos los demás -- ninguno
        // debería pisar ni perder el de otro, sea cual sea el orden real en el
        // que Postgres/Realtime los procesen.
        const marcador = (i: number) => `Escala n=${n} u${i} ${sufijo}`
        await Promise.all(
          pages.map(async (page, i) => {
            const celda = descripcionCelda(page, i)
            await celda.click()
            await celda.fill(marcador(i))
            await celda.blur()
          })
        )

        // Autoridad real: lo que quedó en Postgres, no lo que se ve en pantalla.
        await expect.poll(async () => {
          const cotizacion = await leerCotizacionDelServidor(cotizacionId)
          return cotizacion.items.map((item) => item.descripcion).sort()
        }, {
          timeout: 30_000 + n * 3_000,
          message: `[n=${n}] el servidor no terminó con las ${n} descripciones esperadas -- alguna escritura concurrente se perdió`,
        }).toEqual(Array.from({ length: n }, (_, i) => marcador(i)).sort())

        // Convergencia real en pantalla: la página de CADA participante debe
        // terminar mostrando las descripciones que escribieron TODOS los
        // demás, no solo la propia -- eso es lo que prueba que la
        // reconciliación (eventos *_confirmed + poll de 20s) llega a todos,
        // no solo a quien escribió.
        for (const page of pages) {
          for (let i = 0; i < n; i += 1) {
            await expect(descripcionCelda(page, i)).toHaveValue(marcador(i), { timeout: 30_000 + n * 2_000 })
          }
        }
      } finally {
        await Promise.all(contexts.map((context) => context?.close()))
        if (cotizacionId) await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error(`[live escala][n=${n}] cleanup:`, e))
      }
    })
  }
})
