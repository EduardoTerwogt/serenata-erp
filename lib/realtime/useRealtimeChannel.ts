'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { authorizeRealtime, createPrivateChannel, scheduleTokenRefresh } from '@/lib/realtime/authorize'
import { createPresencePublisher, tryConsumePresenceBudget } from '@/lib/realtime/presence-publisher'

/**
 * Fase 8 (hardening pre-Proyectos): infraestructura de canal privado de
 * Realtime -- autorización, join, reconexión con backoff, refresco de token,
 * cleanup -- extraída de `useQuotationPresence.ts` porque no tiene NADA
 * específico de cotizaciones: solo un `topic` y callbacks. Es la capa 1 de
 * la abstracción que pidió el usuario antes de llevar colaboración a
 * Proyectos.
 *
 * Deliberadamente NO se extrae (todavía) el protocolo de Presence ni el de
 * mutaciones `base`/conflict -- solo hay un consumidor real (Cotizaciones);
 * especular esa forma sin un segundo consumidor sería abstracción prematura.
 * Se extrae recién cuando Proyectos exista y revele qué es realmente común.
 *
 * Contiene los 3 fixes de lifecycle reales encontrados en Fase 8 (ver
 * comentarios inline): esperar `removeChannel()` antes de reconectar, cancelar
 * la cadena de refresco de token anterior antes de pedir una nueva, y son
 * responsabilidad del CONSUMIDOR limpiar cualquier timer propio en
 * `onSessionEnd`.
 *
 * Presence se publica SOLO vía `publishPresence` (ver
 * lib/realtime/presence-publisher.ts): el servidor cierra el canal si un
 * cliente excede 5 eventos de Presence en 30 s -- docs/decisions/016.
 */
export interface UseRealtimeChannelOptions {
  /** `null`/`undefined` deshabilita -- no se intenta conectar. */
  topic: string | null | undefined
  enabled: boolean
  /** Prefijo estable para la key de presence de este cliente (ej. un userId). */
  presenceKeyPrefix: string
  /**
   * Se llama con el canal recién creado, ANTES de `subscribe()` -- el
   * consumidor adjunta aquí sus `.on('presence'|'broadcast', ...)`. Debe ser
   * estable (`useCallback`) o el efecto reconectará en cada render.
   */
  onChannelCreated: (channel: RealtimeChannel) => void
  /** Se llama cuando el canal llega a `SUBSCRIBED` (primera vez o cada reconexión). */
  onSubscribed: (channel: RealtimeChannel) => void | Promise<void>
  /** Se llama cuando el canal cae (`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`), antes de reconectar. */
  onDisconnected: () => void
  /** Se llama al deshabilitar o al desmontar/reconectar por cambio de `topic` --
   *  el consumidor limpia aquí cualquier estado o timer propio de la sesión. */
  onSessionEnd: () => void
}

// Coordina un remount con el cleanup fire-and-forget de la instancia anterior
// del hook: son closures de efectos DISTINTAS (sin estado de React
// compartido entre ellas), así que solo un registro a nivel de módulo,
// compartido por todos los usuarios de este hook, puede saber que ya hay una
// remoción en vuelo para un topic antes de pedirle al cliente un canal nuevo
// para ese mismo topic.
const pendingRemovals = new Map<string, Promise<void>>()

// `RealtimeClient.removeChannel()` solo hace `channel.teardown()` (la baja
// real de su registro interno) cuando `unsubscribe()` resuelve 'ok' -- con
// 'timed out' o 'error' el canal queda registrado igual, y `.channel(topic)`
// lo devolvería de nuevo en el próximo connect() si asumiéramos que ya
// desapareció (@supabase/realtime-js RealtimeClient.js: removeChannel/channel).
// Se reintenta con backoff acotado antes de liberar el topic.
const REMOVE_CHANNEL_RETRY_DELAYS_MS = [500, 1000, 2000]

async function removeChannelWithRetry(channel: RealtimeChannel, topic: string): Promise<void> {
  for (let attempt = 0; attempt <= REMOVE_CHANNEL_RETRY_DELAYS_MS.length; attempt++) {
    let status: string
    try {
      status = await supabaseBrowser.removeChannel(channel)
    } catch (e) {
      status = 'error'
      console.error('[useRealtimeChannel] removeChannel() rechazó la promesa', topic, e)
    }
    if (status === 'ok') return
    const delay = REMOVE_CHANNEL_RETRY_DELAYS_MS[attempt]
    if (delay === undefined) break
    console.error('[useRealtimeChannel] removeChannel() no confirmó "ok", reintentando', { topic, status, attempt })
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  // Reintentos agotados: el canal puede seguir registrado en el cliente real
  // -- no hay forma segura de "forzar" su baja desde aquí. Se libera el
  // topic de todas formas (Realtime es best-effort, `.claude/rules/realtime.md`;
  // la reconciliación contra Postgres sigue garantizando los datos) en vez
  // de bloquear toda reconexión futura a ese topic indefinidamente, mientras
  // el error queda visible en logs para investigar la fuga.
  console.error('[useRealtimeChannel] no se pudo confirmar la remoción del canal tras reintentos -- puede seguir registrado en el cliente de Realtime', topic)
}

export interface UseRealtimeChannelResult {
  /** Canal activo, o `null` si no hay uno (deshabilitado o reconectando). Ref
   *  estable: leer `.current` fuera de un efecto es seguro sin incluirla en
   *  dependencias, igual que cualquier ref. */
  channelRef: React.RefObject<RealtimeChannel | null>
  /**
   * Única vía para publicar el registro de Presence propio -- nunca llamar
   * `channel.track()` directo (se saltaría el presupuesto de
   * lib/realtime/presence-publisher.ts y el servidor cerraría el canal).
   * Guarda el estado deseado y lo envía:
   * agrupando cambios dentro de `PRESENCE_COALESCE_MS`, solo si difiere de lo
   * último enviado por este canal, y respetando el presupuesto (si no hay,
   * espera y manda el ÚLTIMO estado, nunca uno intermedio). Se re-publica
   * solo en cada `SUBSCRIBED` (unión o reconexión). Debe ser un valor
   * serializable estable: la igualdad se evalúa por `JSON.stringify`.
   */
  publishPresence: (payload: Record<string, unknown>) => void
}

export function useRealtimeChannel({
  topic,
  enabled,
  presenceKeyPrefix,
  onChannelCreated,
  onSubscribed,
  onDisconnected,
  onSessionEnd,
}: UseRealtimeChannelOptions): UseRealtimeChannelResult {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [presencePublisher] = useState(createPresencePublisher)

  const onChannelCreatedRef = useRef(onChannelCreated)
  const onSubscribedRef = useRef(onSubscribed)
  const onDisconnectedRef = useRef(onDisconnected)
  const onSessionEndRef = useRef(onSessionEnd)

  // Los refs solo pueden mutarse fuera de render (regla `react-hooks/refs`) --
  // este efecto corre en cada render (sin array de deps) únicamente para
  // mantenerlos apuntando a los callbacks más recientes, sin forzar al efecto
  // de conexión de abajo a reconectar cuando cambia la identidad de una
  // función inline.
  useEffect(() => {
    onChannelCreatedRef.current = onChannelCreated
    onSubscribedRef.current = onSubscribed
    onDisconnectedRef.current = onDisconnected
    onSessionEndRef.current = onSessionEnd
  })

  useEffect(() => {
    if (!enabled || !topic) {
      onSessionEndRef.current()
      return
    }

    let cancelled = false
    let cancelTokenRefresh: (() => void) | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0

    // Root cause confirmado en vivo (CI, 2026-09-10): sin reconexión, el canal
    // de un colaborador se cae a CLOSED apenas arranca la sesión y se queda
    // muerto para siempre -- nada volvía a llamar `channel.subscribe()`.
    const connect = async () => {
      if (cancelled) return

      // Un remount (mismo topic) puede ocurrir en el mismo tick que el
      // cleanup fire-and-forget de la instancia anterior (ver return() más
      // abajo) -- sin esperar esa remoción en vuelo, `.channel(topic)`
      // reutilizaría el objeto todavía unido en vez de crear uno nuevo
      // (EF-2 1A-1: expuesto por el test de remount, antes solo verificaba
      // conteos de creación, nunca convergencia real).
      const pendingRemoval = pendingRemovals.get(topic)
      if (pendingRemoval) {
        await pendingRemoval
        if (cancelled) return
      }

      // Cancelar la cadena de refresco de token anterior ANTES de pedir una
      // nueva -- sin esto, cada reconexión dejaba viva una cadena adicional
      // que nunca se cancelaba hasta el unmount final (`scheduleTokenRefresh`
      // se reprograma sola indefinidamente).
      cancelTokenRefresh?.()
      cancelTokenRefresh = null

      const random = Math.random().toString(36).slice(2, 8)

      // Canal PRIVADO: requiere autorizar la sesión de Realtime (JWT corto
      // derivado de la sesión de NextAuth) antes de unirse -- ver
      // lib/realtime/authorize.ts y db/migrations/20260909_realtime_broadcast_authorization.sql.
      const channel = createPrivateChannel(topic, {
        presence: { key: `${presenceKeyPrefix}-${random}` },
      })

      const scheduleReconnect = () => {
        if (cancelled || reconnectTimer !== null) return
        reconnectAttempt += 1
        const delayMs = Math.min(1_000 * 2 ** (reconnectAttempt - 1), 10_000)
        reconnectTimer = window.setTimeout(async () => {
          reconnectTimer = null
          // Root cause real de "cannot add presence callbacks after joining a
          // channel" (visto en logs de CI): `RealtimeClient.channel()` REUSA
          // el objeto de canal existente para el mismo topic si no se liberó
          // todavía, y `removeChannel()` es async. Sin este `await`, `connect()`
          // podía pedir un canal para el mismo topic y recibir de vuelta ESTE
          // MISMO objeto (ya `isJoined()`), y el primer `.on('presence', ...)`
          // de la reconexión lanzaba esa excepción -- abortando el intento de
          // reconexión a medias, sin llegar nunca a `channel.subscribe()`.
          // Con reintento (igual que el cleanup de desmontaje): un
          // `removeChannel()` que no confirma 'ok' deja el canal registrado y
          // `.channel(topic)` lo devolvería de nuevo.
          await removeChannelWithRetry(channel, topic)
          if (channelRef.current === channel) channelRef.current = null
          if (!cancelled) runConnect()
        }, delayMs)
      }

      // Si aun así `.channel(topic)` devolvió un canal que no se terminó de
      // retirar, `.on('presence', ...)` lanza (en la versión fijada, 2.112, también
      // en estado *joining*, no solo *joined*). Antes esa excepción rechazaba
      // `connect()` en silencio y el canal quedaba muerto sin log ni
      // reintento; ahora se registra y se vuelve a intentar con backoff.
      try {
        onChannelCreatedRef.current(channel)
      } catch (e) {
        console.error('[useRealtimeChannel] no se pudieron registrar los listeners del canal, reintentando', topic, e)
        channelRef.current = channel
        scheduleReconnect()
        return
      }

      const join = async () => {
        // Si autorizar falla (red, endpoint caído), igual se intenta unir: el
        // join simplemente lo rechaza la política RLS.
        try {
          const ttlSeconds = await authorizeRealtime()
          if (!cancelled) cancelTokenRefresh = scheduleTokenRefresh(ttlSeconds)
        } catch (e) {
          console.error('[useRealtimeChannel] No se pudo autorizar el canal de Realtime', e)
        }
        if (cancelled) return

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            reconnectAttempt = 0
            await onSubscribedRef.current(channel)
            if (!cancelled && channelRef.current === channel) presencePublisher.attach(channel)
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('[useRealtimeChannel] canal de Realtime perdió la conexión, reconectando', status)
            presencePublisher.detach()
            onDisconnectedRef.current()
            scheduleReconnect()
          }
        })
      }

      channelRef.current = channel
      void join()
    }

    // Nunca `void connect()`: un rechazo quedaría como unhandled rejection y el
    // canal muerto sin rastro -- fallar explícito.
    function runConnect() {
      connect().catch((e) => {
        console.error('[useRealtimeChannel] connect() falló', topic, e)
      })
    }

    runConnect()

    return () => {
      cancelled = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      cancelTokenRefresh?.()
      presencePublisher.reset()
      onSessionEndRef.current()
      const channel = channelRef.current
      if (channel) {
        // `untrack` cuenta contra el límite de Presence del servidor; si no
        // queda presupuesto se omite -- el `phx_leave` de `removeChannel`
        // ya borra el registro en el servidor al salir del canal.
        if (tryConsumePresenceBudget()) void channel.untrack().catch(() => null)
        // Fire-and-forget deliberado (el cleanup de un efecto no puede ser
        // async) -- pero se registra la promesa para que un remount
        // inmediato del mismo topic (ver connect() arriba) la espere antes
        // de reutilizar/crear un canal, en vez de perder la referencia a una
        // remoción todavía en curso. removeChannelWithRetry nunca rechaza
        // (atrapa sus propios errores) y solo libera el topic cuando
        // confirma 'ok' o agota los reintentos -- nunca en cuanto la
        // promesa "resuelve" sin más, que es lo que dejaba reutilizar un
        // canal que el cliente real nunca terminó de dar de baja.
        const removal = removeChannelWithRetry(channel, topic).finally(() => {
          if (pendingRemovals.get(topic) === removal) pendingRemovals.delete(topic)
        })
        pendingRemovals.set(topic, removal)
      }
      channelRef.current = null
    }
  }, [topic, enabled, presenceKeyPrefix, presencePublisher])

  return { channelRef, publishPresence: presencePublisher.publish }
}
