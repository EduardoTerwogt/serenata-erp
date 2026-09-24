import type { RealtimeChannel } from '@supabase/supabase-js'

// ============================================================================
// Presupuesto de Presence (docs/decisions/016).
//
// El servidor de Supabase Realtime CIERRA el canal (`ClientPresenceRateLimitReached`
// + `shutdown_response`) cuando un cliente manda más de 5 eventos de Presence
// (`track` + `untrack`) en una ventana fija de 30 s -- supabase/realtime
// `presence_handler.ex` (`limit_client_presence_event`, `max_calls: 5,
// window_ms: 30_000`). Antes de esto, el heartbeat de 15 s y un `track()` por
// tecla lo excedían constantemente (427 cierres en 24 h en test): cada cierre
// cortaba Presence Y los broadcasts `*_confirmed` hasta reconectar.
//
// Token bucket: ráfaga de 2 y +1 cada 15 s => nunca más de 4 envíos en
// cualquier ventana de 30 s (deslizante, así que tampoco en la fija del
// servidor), con demora máxima de 15 s para un cambio. A nivel de MÓDULO: el
// servidor cuenta por unión al canal, pero compartir el presupuesto entre
// todos los canales de esta pestaña es estrictamente más conservador y cubre
// un cambio rápido de una cotización a otra.
//
// Sin timers ni efectos al importar: todo corre en callbacks del navegador.
// ============================================================================

export const PRESENCE_BUCKET_CAPACITY = 2
export const PRESENCE_REFILL_MS = 15_000
/** Los cambios dentro de esta ventana (foco de sección + celda en el mismo
 *  gesto, salir de una celda y entrar a la siguiente) salen en un solo envío. */
export const PRESENCE_COALESCE_MS = 150
/** Reintentos de un `track()` fallido antes de rendirse (cada uno consume presupuesto). */
export const PRESENCE_MAX_CONSECUTIVE_FAILURES = 2

const presenceBudget = { tokens: PRESENCE_BUCKET_CAPACITY, lastRefillAt: 0 }

function refillPresenceBudget(now: number) {
  if (presenceBudget.tokens >= PRESENCE_BUCKET_CAPACITY) {
    presenceBudget.lastRefillAt = now
    return
  }
  const refills = Math.floor((now - presenceBudget.lastRefillAt) / PRESENCE_REFILL_MS)
  if (refills <= 0) return
  presenceBudget.tokens = Math.min(PRESENCE_BUCKET_CAPACITY, presenceBudget.tokens + refills)
  presenceBudget.lastRefillAt += refills * PRESENCE_REFILL_MS
}

/** Consume un evento de Presence del presupuesto; `false` si no queda. */
export function tryConsumePresenceBudget(): boolean {
  refillPresenceBudget(Date.now())
  if (presenceBudget.tokens <= 0) return false
  presenceBudget.tokens -= 1
  return true
}

function msUntilNextPresenceToken(): number {
  const now = Date.now()
  refillPresenceBudget(now)
  if (presenceBudget.tokens > 0) return 0
  return Math.max(0, presenceBudget.lastRefillAt + PRESENCE_REFILL_MS - now)
}

/** Solo para tests: el presupuesto es estado de módulo compartido entre casos. */
export function __resetPresenceBudgetForTests() {
  presenceBudget.tokens = PRESENCE_BUCKET_CAPACITY
  presenceBudget.lastRefillAt = 0
}

export interface PresencePublisher {
  /** Registra el estado deseado; se envía agrupado, deduplicado y dentro del presupuesto. */
  publish: (payload: Record<string, unknown>) => void
  /** El canal llegó a `SUBSCRIBED` (unión o reconexión): el servidor no tiene nada de este join, re-publicar. */
  attach: (channel: RealtimeChannel) => void
  /** El canal cayó o se retiró: no enviar nada hasta el próximo `attach`. Conserva el estado deseado. */
  detach: () => void
  /** Fin de sesión (desmontaje / cambio de topic): olvida también el estado deseado. */
  reset: () => void
}

/**
 * Publicador de Presence para UN consumidor. Única vía para mandar el registro
 * propio -- nunca llamar `channel.track()` directo, se saltaría el presupuesto.
 *
 * - Agrupa los cambios dentro de `PRESENCE_COALESCE_MS` y manda solo el último.
 * - No envía si el estado es idéntico (por `JSON.stringify`) a lo último
 *   enviado por ESE canal -- teclear en una celda ya no genera un envío por tecla.
 * - Sin presupuesto, espera al siguiente token y manda el estado MÁS RECIENTE,
 *   nunca uno intermedio.
 * - Un `track()` que no confirma 'ok' (timeout/error; en realtime-js resuelve
 *   con ese status, no rechaza) se reintenta hasta
 *   `PRESENCE_MAX_CONSECUTIVE_FAILURES` veces, siempre dentro del presupuesto.
 */
export function createPresencePublisher(): PresencePublisher {
  let desired: Record<string, unknown> | null = null
  let channel: RealtimeChannel | null = null
  let lastSent: { channel: RealtimeChannel; json: string } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let consecutiveFailures = 0

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const schedule = (delayMs: number) => {
    if (timer !== null) return
    timer = setTimeout(flush, delayMs)
  }

  const onTrackFailed = (target: RealtimeChannel, json: string, reason: unknown) => {
    // Canal ya retirado o reemplazado: su registro murió con él, nada que reintentar.
    if (channel !== target) return
    // No se sabe si el servidor lo aplicó -- olvidar el "último enviado" para
    // que el próximo flush lo vuelva a mandar.
    if (lastSent?.channel === target && lastSent.json === json) lastSent = null
    consecutiveFailures += 1
    if (consecutiveFailures > PRESENCE_MAX_CONSECUTIVE_FAILURES) {
      console.error('[presence-publisher] track() agotó reintentos', reason)
      return
    }
    schedule(PRESENCE_COALESCE_MS)
  }

  function flush() {
    timer = null
    const target = channel
    const payload = desired
    if (!target || !payload) return
    const json = JSON.stringify(payload)
    if (lastSent && lastSent.channel === target && lastSent.json === json) return
    if (!tryConsumePresenceBudget()) {
      schedule(msUntilNextPresenceToken())
      return
    }
    lastSent = { channel: target, json }
    target.track(payload).then(
      (status) => {
        if (status === 'ok') {
          if (channel === target) consecutiveFailures = 0
          return
        }
        onTrackFailed(target, json, status)
      },
      (error: unknown) => onTrackFailed(target, json, error)
    )
  }

  return {
    publish(payload) {
      desired = payload
      schedule(PRESENCE_COALESCE_MS)
    },
    attach(next) {
      channel = next
      lastSent = null
      consecutiveFailures = 0
      clearTimer()
      // Sin agrupar: es la primera publicación de este join.
      flush()
    },
    detach() {
      channel = null
      lastSent = null
      clearTimer()
    },
    reset() {
      desired = null
      channel = null
      lastSent = null
      consecutiveFailures = 0
      clearTimer()
    },
  }
}
