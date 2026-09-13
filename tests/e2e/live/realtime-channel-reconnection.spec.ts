import { test, expect, BrowserContext, Page } from '@playwright/test'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, cleanupOrphanedFolioReservations, cleanupOrphanedTestProductos } from '../utils/live-cleanup'
import { esperarCanalColaborativo, faltantesDelEntornoLive, liveEnabled } from '../utils/live-helpers'
import { cleanupLiveUser, ensureLiveUser } from '../utils/live-users'

/**
 * EF-2 1A-2: `useRealtimeChannel.ts` tiene 3 fixes de lifecycle (reconexión
 * con backoff, cancelación de refresco de token, cleanup) que hasta ahora
 * solo se habían confirmado "en vivo" en un incidente real de CI
 * (2026-09-10) -- nunca con un test que reproduzca la caída de forma
 * determinista. `useRealtimeChannel.test.ts` (unitario) cubre la lógica en
 * aislamiento con mocks; este spec la ejercita contra el servidor real de
 * Realtime, con dos usuarios reales sobre la misma cotización.
 *
 * Mecanismo determinista: `context.setOffline(true/false)` corta y restaura
 * la red del navegador de B a nivel de sistema -- dispara el mismo camino
 * real de `CHANNEL_ERROR`/`TIMED_OUT` -> `onDisconnected()` ->
 * `scheduleReconnect()` que una caída de red real, pero en el momento exacto
 * que el test controla.
 *
 * El seam `window.__e2eSupabaseBrowser` (lib/supabase-browser.ts, gateado
 * por NEXT_PUBLIC_E2E_TEST_HOOKS, solo 'true' en este job de CI) permite
 * contar canales activos para confirmar que una reconexión no deja
 * canales huérfanos.
 */

const PREFIJO = 'E2E-LIVE-RT-RECONNECT-'

const USUARIO_B = {
  email: 'e2e-live-rt-reconnect-b@serenata.test',
  password: 'RtReconnectB-live-2026',
  name: 'Reconnect Bravo',
}
const NOMBRE_CORTO_B = 'Reconnect Bravo'

function vigilarPageErrors(page: Page, etiqueta: string): { errores: string[] } {
  const estado = { errores: [] as string[] }
  page.on('pageerror', (error) => {
    estado.errores.push(error.message)
    console.log(`[live rt-reconnect][${etiqueta}] pageerror: ${error.message}`)
  })
  return estado
}

async function contarCanalesActivos(page: Page): Promise<number> {
  return page.evaluate(() => {
    const browser = (window as unknown as { __e2eSupabaseBrowser?: { getChannels(): unknown[] } }).__e2eSupabaseBrowser
    if (!browser) throw new Error('window.__e2eSupabaseBrowser no está expuesto -- falta NEXT_PUBLIC_E2E_TEST_HOOKS=true en este build')
    return browser.getChannels().length
  })
}

async function crearCotizacion(page: Page, cliente: string, proyecto: string) {
  const response = await page.request.post('/api/cotizaciones', {
    data: {
      cliente,
      proyecto,
      estado: 'BORRADOR',
      items: [{ categoria: 'Equipo', descripcion: 'Item de prueba', cantidad: 1, precio_unitario: 100, x_pagar: 0, orden: 0 }],
    },
  })
  expect(response.status(), `no se pudo crear la cotización de prueba: ${await response.text()}`).toBe(201)
  const body = await response.json() as { id: string }
  return body.id
}

test.describe('live: guard del entorno (reconexión de Realtime)', () => {
  test('el entorno live está configurado cuando CI lo exige', () => {
    test.skip(process.env.PLAYWRIGHT_LIVE_REQUIRED !== 'true', 'Solo aplica en el job live de CI')
    expect(faltantesDelEntornoLive(), 'Faltan variables del entorno live').toEqual([])
  })
})

test.describe('live: reconexión y resync del canal de Realtime', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')
  test.describe.configure({ mode: 'serial' })

  let contextA: BrowserContext
  let contextB: BrowserContext
  let pageA: Page
  let pageB: Page
  let cotizacionId = ''
  let erroresA: { errores: string[] }
  let erroresB: { errores: string[] }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000)

    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live rt-reconnect] barrido inicial:', e))
    await cleanupOrphanedFolioReservations().catch((e) => console.error('[live rt-reconnect] reservas huérfanas:', e))
    await cleanupOrphanedTestProductos().catch((e) => console.error('[live rt-reconnect] productos huérfanos:', e))
    await ensureLiveUser(USUARIO_B)

    const suffix = Date.now()

    contextA = await browser.newContext()
    pageA = await contextA.newPage()
    erroresA = vigilarPageErrors(pageA, 'A')
    await login(pageA, '/cotizaciones')

    cotizacionId = await crearCotizacion(pageA, `${PREFIJO}${suffix}`, `Reconexión ${suffix}`)

    contextB = await browser.newContext()
    pageB = await contextB.newPage()
    erroresB = vigilarPageErrors(pageB, 'B')
    await login(pageB, '/cotizaciones', { email: USUARIO_B.email, password: USUARIO_B.password })

    await pageA.goto(`/cotizaciones/${cotizacionId}`)
    await pageB.goto(`/cotizaciones/${cotizacionId}`)

    await esperarCanalColaborativo([
      { page: pageA, veA: NOMBRE_CORTO_B },
      { page: pageB },
    ])
  })

  test.afterAll(async () => {
    await contextA?.close()
    await contextB?.close()
    if (cotizacionId) await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error('[live rt-reconnect] cleanup cotización:', e))
    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live rt-reconnect] barrido final:', e))
    await cleanupLiveUser(USUARIO_B.email).catch((e) => console.error('[live rt-reconnect] cleanup usuario:', e))
  })

  test('desconexión → reconexión: B vuelve a SUBSCRIBED, resincroniza lo perdido y recupera Presence, sin canales huérfanos ni pageerror', async () => {
    // El heartbeat de Realtime (Phoenix) puede tardar bastante en notar una
    // conexión caída -- este ciclo completo (offline, patch de A, online,
    // reconexión, resync, presence) necesita más que el default.
    test.setTimeout(150_000)

    const canalesAntes = await contarCanalesActivos(pageB)

    await contextB.setOffline(true)

    // Mientras B está offline, A cambia un campo real vía la ruta real --
    // el broadcast que emite el servidor nunca llega a B en este momento.
    const nuevaLocacion = `Reconexión ${Date.now()}`
    const patchResponse = await pageA.request.patch(`/api/cotizaciones/${cotizacionId}/general`, {
      data: { locacion: nuevaLocacion },
    })
    expect(patchResponse.ok(), `PATCH general falló: ${patchResponse.status()}`).toBeTruthy()

    await contextB.setOffline(false)

    // Resync por reconexión (isConnected -> reconciliarConServidor en el
    // efecto de `acabaDeReconectar`): el valor que B se perdió por broadcast
    // debe llegar igual, vía la reconciliación que dispara `onSubscribed`.
    await expect(pageB.getByPlaceholder('Lugar del evento')).toHaveValue(nuevaLocacion, { timeout: 60_000 })

    // Recuperación de Presence: cada pantalla vuelve a ver a la otra en
    // "Colaborando ahora" -- no queda mostrando al otro como desconectado.
    await esperarCanalColaborativo([
      { page: pageA, veA: NOMBRE_CORTO_B },
      { page: pageB },
    ], 30_000)

    // Ausencia de canales huérfanos: mismo número de canales activos para
    // este topic antes del ciclo offline->online que después -- nunca más.
    const canalesDespues = await contarCanalesActivos(pageB)
    expect(canalesDespues, 'no debería quedar más de un canal activo tras la reconexión').toBe(canalesAntes)

    // Ausencia de pageerror: cero errores de JS durante todo el ciclo en
    // ambas pantallas -- cubre específicamente una regresión del tipo
    // "cannot add presence callbacks after joining a channel".
    expect(erroresA.errores, `errores de JS en A: ${erroresA.errores.join('; ')}`).toEqual([])
    expect(erroresB.errores, `errores de JS en B: ${erroresB.errores.join('; ')}`).toEqual([])
  })

  test('resync por visibilitychange: volver de segundo plano dispara una reconciliación contra el servidor', async () => {
    test.setTimeout(30_000)

    // Ventana corta y determinista: RECONCILIACION_MS (poll de última
    // instancia) es de 20s -- este test debe capturar la petición disparada
    // por `visibilitychange`, no confundirla con ese poll periódico.
    const reconciliacion = pageB.waitForRequest(
      (req) => req.url().includes(`/api/cotizaciones/${cotizacionId}`) && req.method() === 'GET',
      { timeout: 10_000 }
    )

    await pageB.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect(reconciliacion).resolves.toBeTruthy()
  })
})
