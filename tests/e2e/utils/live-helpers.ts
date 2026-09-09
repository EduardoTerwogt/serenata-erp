import { expect, Page } from '@playwright/test'
import { getLiveSupabaseAdmin } from './live-cleanup'

/**
 * Variables que el nivel `live` necesita para correr de verdad. Si falta una, los
 * tests se saltan en local; en CI el guard de `PLAYWRIGHT_LIVE_REQUIRED` los hace
 * fallar (ver `faltantesDelEntornoLive`).
 */
export function faltantesDelEntornoLive(): string[] {
  const faltantes = ['PLAYWRIGHT_BASE_URL', 'PLAYWRIGHT_TEST_EMAIL', 'PLAYWRIGHT_TEST_PASSWORD']
    .filter((clave) => !process.env[clave])

  if (process.env.PLAYWRIGHT_E2E_BYPASS === 'true') {
    // Con el bypass activo no hay login real y todas las sesiones son el mismo
    // usuario ficticio: la colaboración sería indistinguible de una sola persona.
    faltantes.push('PLAYWRIGHT_E2E_BYPASS debe estar apagado')
  }

  return faltantes
}

export const liveEnabled = faltantesDelEntornoLive().length === 0

/**
 * Hace clic en "Generar Cotizacion" y espera a que pase UNA de dos cosas
 * reales: navega a /cotizaciones/{id}, o aparece el banner de error rojo de
 * la página (onGenerarCotizacion cayó en su catch). Diagnostico: 3 corridas
 * de CI seguidas se quedaron colgadas en /cotizaciones/nueva sin navegar --
 * subir el timeout no cambió nada (siempre esperaba exactamente el timeout
 * configurado, sin progreso intermedio), lo que apunta a un error real que
 * se estaba tragando en silencio, no a una operación lenta. Este helper
 * saca el texto real del error al log de CI en vez de un timeout genérico.
 */
export async function clickGenerarCotizacionOrThrow(page: Page, timeoutMs = 60_000) {
  await page.getByRole('button', { name: 'Generar Cotizacion' }).click()

  const errorBanner = page.locator('.bg-red-900\\/40').first()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (/\/cotizaciones\/SH[A-Z0-9-]+/.test(page.url())) return

    if (await errorBanner.isVisible().catch(() => false)) {
      const text = (await errorBanner.textContent().catch(() => null))?.trim() || '(no se pudo leer el texto del banner)'
      const message = `"Generar Cotizacion" no navego -- error real mostrado por la app: ${text}`
      console.log(`[live test] ${message}`)
      throw new Error(message)
    }

    await page.waitForTimeout(500)
  }

  throw new Error(
    `"Generar Cotizacion" no navego y no aparecio ningun banner de error visible en ${timeoutMs}ms ` +
    `(posible cuelgue silencioso del lado del cliente o del servidor).`
  )
}

/**
 * Espera a que CADA pantalla vea a la otra persona en el bloque "Colaborando ahora".
 *
 * Anclado a la presencia real que renderiza la app, no a un `waitForTimeout`: si el
 * canal de tiempo real no conecta (Realtime deshabilitado en el proyecto, llave
 * anónima sin permiso sobre el canal), el error dice exactamente eso en vez de dejar
 * un timeout genérico en el que despues hay que adivinar la causa.
 */
export async function esperarCanalColaborativo(
  participantes: Array<{ page: Page; veA?: string }>,
  timeoutMs = 30_000
) {
  for (const { page, veA } of participantes) {
    try {
      await expect(page.getByText('Solo tú en esta cotización')).toBeHidden({ timeout: timeoutMs })
      if (veA) await expect(page.getByText(veA, { exact: true }).first()).toBeVisible({ timeout: timeoutMs })
    } catch {
      throw new Error(
        `El canal de tiempo real nunca conectó: una de las pantallas no llegó a ver a la otra persona` +
        `${veA ? ` ("${veA}")` : ''} ` +
        `en "Colaborando ahora" en ${timeoutMs}ms. Sin presencia no hay colaboración que probar; ` +
        `revisar que Realtime esté habilitado en el proyecto de prueba y que la llave anónima ` +
        `pueda unirse al canal "cotizacion:{id}".`
      )
    }
  }
}

interface ItemServidor {
  id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  x_pagar: number
  importe: number
  orden: number | null
}

interface CotizacionServidor {
  id: string
  cliente: string
  proyecto: string
  locacion: string | null
  notas_internas: string | null
  subtotal: number
  porcentaje_fee: number
  items: ItemServidor[]
}

/**
 * Lee la cotización directo de Supabase. Una prueba de colaboración que solo mira el
 * DOM no distingue "se guardó" de "se ve guardado": lo que el usuario reportó era
 * justamente que en pantalla se veía mal y al recargar aparecía bien (y al revés).
 */
export async function leerCotizacionDelServidor(cotizacionId: string): Promise<CotizacionServidor> {
  const supabase = getLiveSupabaseAdmin()
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id, cliente, proyecto, locacion, notas_internas, subtotal, porcentaje_fee, items_cotizacion(id, descripcion, cantidad, precio_unitario, x_pagar, importe, orden)')
    .eq('id', cotizacionId)
    .single()
  if (error) throw error

  const row = data as unknown as Omit<CotizacionServidor, 'items'> & { items_cotizacion: ItemServidor[] }
  const items = [...(row.items_cotizacion || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  return { ...row, items }
}
