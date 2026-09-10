import { test, expect, BrowserContext, Page } from '@playwright/test'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { login } from '../utils/auth'
import { cleanupLiveCotizacion, cleanupLiveCotizacionesByPrefix, cleanupOrphanedFolioReservations } from '../utils/live-cleanup'
import { faltantesDelEntornoLive, liveEnabled } from '../utils/live-helpers'
import { cleanupLiveUser, ensureLiveUser } from '../utils/live-users'

/**
 * Prueba, de forma aislada de la UI, que la autorización de canal de Fase 1
 * funciona exactamente como dicen los criterios de éxito: un staff con la
 * sección "cotizaciones" se une al canal privado y recibe un evento
 * confirmado real; uno sin esa sección, o con un token inválido/expirado,
 * no. No reemplaza a `cotizaciones-colaboracion.spec.ts` (que prueba la
 * experiencia completa vía la UI) -- esto prueba la capa de RLS +
 * JWT en sí misma, con supabase-js directo, igual que la haría cualquier
 * cliente autorizado o no.
 */

const PREFIJO = 'E2E-LIVE-REALTIME-AUTH-'

const USUARIO_SIN_COTIZACIONES = {
  email: 'e2e-live-realtime-sin-cotizaciones@serenata.test',
  password: 'SinCotizaciones-live-2026',
  name: 'Sin Cotizaciones',
  sections: ['dashboard'],
}

function anonClient() {
  const url = process.env.TEST_SUPABASE_URL
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY son requeridas')
  return createClient(url, anonKey)
}

async function fetchRealtimeToken(page: Page): Promise<string> {
  const res = await page.request.get('/api/realtime/token')
  expect(res.ok(), `GET /api/realtime/token falló: ${res.status()} ${await res.text()}`).toBeTruthy()
  const body = await res.json() as { token: string }
  return body.token
}

/** Espera hasta `timeoutMs` a que el canal llegue a SUBSCRIBED. Si nunca
 *  llega (rechazado por la política RLS, token inválido/expirado), resuelve
 *  `false` en vez de colgarse -- eso es exactamente lo que los casos
 *  "no autorizado" necesitan poder afirmar. */
function esperarEstadoSuscripcion(channel: RealtimeChannel, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let resuelto = false
    const timer = setTimeout(() => {
      if (!resuelto) { resuelto = true; resolve(false) }
    }, timeoutMs)

    channel.subscribe((status) => {
      if (resuelto) return
      if (status === 'SUBSCRIBED') {
        resuelto = true
        clearTimeout(timer)
        resolve(true)
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resuelto = true
        clearTimeout(timer)
        resolve(false)
      }
    })
  })
}

test.describe('live: guard del entorno (autorización de canal)', () => {
  test('el entorno live está configurado cuando CI lo exige', () => {
    test.skip(process.env.PLAYWRIGHT_LIVE_REQUIRED !== 'true', 'Solo aplica en el job live de CI')
    expect(faltantesDelEntornoLive(), 'Faltan variables del entorno live').toEqual([])
    expect(process.env.SUPABASE_JWT_SECRET, 'SUPABASE_JWT_SECRET debe estar configurado para este job').toBeTruthy()
  })
})

test.describe('live: autorización del canal privado de Realtime', () => {
  test.skip(!liveEnabled, 'Requiere PLAYWRIGHT_BASE_URL, credenciales reales y el bypass apagado')
  test.describe.configure({ mode: 'serial' })

  let context: BrowserContext
  let contextSinSeccion: BrowserContext
  let page: Page
  let pageSinSeccion: Page
  let cotizacionId = ''
  const canalesAbiertos: RealtimeChannel[] = []

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000)

    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live realtime-auth] barrido inicial:', e))
    await cleanupOrphanedFolioReservations().catch((e) => console.error('[live realtime-auth] reservas huérfanas:', e))
    await ensureLiveUser(USUARIO_SIN_COTIZACIONES)

    context = await browser.newContext()
    page = await context.newPage()
    await login(page, '/cotizaciones')

    const suffix = Date.now()
    const response = await page.request.post('/api/cotizaciones', {
      data: {
        cliente: `${PREFIJO}${suffix}`,
        proyecto: `Auth canal ${suffix}`,
        estado: 'BORRADOR',
        items: [{ categoria: 'Equipo', descripcion: 'Item de prueba', cantidad: 1, precio_unitario: 100, x_pagar: 0, orden: 0 }],
      },
    })
    expect(response.status(), `no se pudo crear la cotización de prueba: ${await response.text()}`).toBe(201)
    cotizacionId = (await response.json() as { id: string }).id

    contextSinSeccion = await browser.newContext()
    pageSinSeccion = await contextSinSeccion.newPage()
    await login(pageSinSeccion, '/dashboard', { email: USUARIO_SIN_COTIZACIONES.email, password: USUARIO_SIN_COTIZACIONES.password })
  })

  test.afterAll(async () => {
    canalesAbiertos.forEach((c) => { void c.unsubscribe() })
    await context?.close()
    await contextSinSeccion?.close()
    if (cotizacionId) await cleanupLiveCotizacion(cotizacionId).catch((e) => console.error('[live realtime-auth] cleanup cotización:', e))
    await cleanupLiveCotizacionesByPrefix(PREFIJO).catch((e) => console.error('[live realtime-auth] barrido final:', e))
    await cleanupLiveUser(USUARIO_SIN_COTIZACIONES.email).catch((e) => console.error('[live realtime-auth] cleanup usuario:', e))
  })

  test('un staff con sección "cotizaciones" se une al canal privado y recibe un evento confirmado real', async () => {
    test.setTimeout(60_000)

    const token = await fetchRealtimeToken(page)
    const client = anonClient()
    await client.realtime.setAuth(token)

    const channel = client.channel(`cotizacion:${cotizacionId}`, { config: { private: true } })
    canalesAbiertos.push(channel)

    const eventoRecibido = new Promise<boolean>((resolve) => {
      channel.on('broadcast', { event: 'general_confirmed' }, () => resolve(true))
      setTimeout(() => resolve(false), 20_000)
    })

    const suscrito = await esperarEstadoSuscripcion(channel, 15_000)
    expect(suscrito, 'un cliente autorizado (sección cotizaciones) debería poder unirse al canal privado').toBe(true)

    // Disparar un evento confirmado real, PATCHeando la misma cotización vía
    // la ruta real -- así el broadcast recibido es el que emite
    // lib/server/realtime/broadcast.ts, no uno simulado.
    const patchResponse = await page.request.patch(`/api/cotizaciones/${cotizacionId}/general`, {
      data: { locacion: `Locación actualizada ${Date.now()}` },
    })
    expect(patchResponse.ok(), `PATCH general falló: ${patchResponse.status()}`).toBeTruthy()

    expect(await eventoRecibido, 'el cliente autorizado debería recibir el evento "general_confirmed" emitido por el servidor').toBe(true)

    await client.removeChannel(channel)
  })

  test('un staff sin la sección "cotizaciones" no puede unirse al canal', async () => {
    test.setTimeout(60_000)

    const token = await fetchRealtimeToken(pageSinSeccion)
    const client = anonClient()
    await client.realtime.setAuth(token)

    const channel = client.channel(`cotizacion:${cotizacionId}`, { config: { private: true } })
    canalesAbiertos.push(channel)

    const suscrito = await esperarEstadoSuscripcion(channel, 15_000)
    expect(suscrito, 'un cliente sin la sección "cotizaciones" NO debería poder unirse al canal privado').toBe(false)

    await client.removeChannel(channel)
  })

  test('un token con firma inválida no puede unirse al canal', async () => {
    test.setTimeout(60_000)

    const client = anonClient()
    // Firma deliberadamente inválida (no coincide con SUPABASE_JWT_SECRET del
    // proyecto) -- misma forma que un JWT real, contenido sin sentido.
    await client.realtime.setAuth('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.firma-invalida')

    const channel = client.channel(`cotizacion:${cotizacionId}`, { config: { private: true } })
    canalesAbiertos.push(channel)

    const suscrito = await esperarEstadoSuscripcion(channel, 15_000)
    expect(suscrito, 'un token con firma inválida NO debería poder unirse al canal privado').toBe(false)

    await client.removeChannel(channel)
  })

  test('un token expirado no puede unirse al canal', async () => {
    test.setTimeout(60_000)

    // Mismo secreto que firma app/api/realtime/token (SUPABASE_JWT_SECRET ya
    // está en el entorno de este job de CI), pero con `exp` en el pasado.
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      test.skip(true, 'SUPABASE_JWT_SECRET no está en el entorno de este job')
      return
    }

    const expiredToken = await new SignJWT({ role: 'authenticated', sections: ['cotizaciones'] })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('test-expired-user')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(new TextEncoder().encode(secret))

    const client = anonClient()
    await client.realtime.setAuth(expiredToken)

    const channel = client.channel(`cotizacion:${cotizacionId}`, { config: { private: true } })
    canalesAbiertos.push(channel)

    const suscrito = await esperarEstadoSuscripcion(channel, 15_000)
    expect(suscrito, 'un token expirado NO debería poder unirse al canal privado').toBe(false)

    await client.removeChannel(channel)
  })
})
