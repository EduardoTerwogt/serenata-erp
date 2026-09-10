'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { authorizeRealtime, createPrivateChannel, scheduleTokenRefresh } from '@/lib/realtime/authorize'

export type QuotationPresenceSection = 'notas' | 'general' | 'partidas' | 'totales'
export type QuotationItemCellField = 'categoria' | 'descripcion' | 'cantidad' | 'precio_unitario' | 'responsable_id' | 'x_pagar'

// Cada cuánto se re-afirma el registro de Presence propio mientras el canal está
// habilitado -- red de última instancia contra un diff perdido en el transporte, no
// el camino primario (ver comentario en el useEffect que lo usa).
const PRESENCE_HEARTBEAT_MS = 15_000

interface CurrentUser {
  id?: string | null
  email?: string | null
  name?: string | null
}

/**
 * Un registro de Presence real (Supabase Realtime), no un dato de negocio: cada
 * cliente publica el suyo propio vía `channel.track()` y Supabase lo sincroniza a
 * todos los demás. Puramente informativo -- quién está conectado, en qué sección,
 * sobre qué celda -- nunca decide conflictos, nunca bloquea una edición, nunca es
 * la fuente de verdad de ningún dato de la cotización (esa es siempre PostgreSQL,
 * vía los eventos `*_confirmed` más abajo).
 */
export interface QuotationPresenceUser {
  user_id: string
  email: string
  name: string
  active_section: QuotationPresenceSection | null
  /** Fila que este usuario tiene enfocada ahora mismo, si está en Partidas. */
  entity_id: string | null
  /** Campo de esa fila, si `entity_id` no es null. */
  field: QuotationItemCellField | null
  online_at: string
}

interface UseQuotationPresenceOptions {
  cotizacionId: string
  enabled: boolean
  currentUser: CurrentUser | null
}

interface UseQuotationPresenceResult {
  onlineUsers: QuotationPresenceUser[]
  sectionEditors: Partial<Record<QuotationPresenceSection, QuotationPresenceUser>>
  itemCellEditors: Record<string, QuotationPresenceUser>
  latestItemConfirmed: ItemConfirmedPayload | null
  latestGeneralConfirmed: SectionConfirmedPayload | null
  latestTotalesConfirmed: SectionConfirmedPayload | null
  latestNotasConfirmed: SectionConfirmedPayload | null
  setActiveSection: (section: QuotationPresenceSection | null) => void
  releaseSection: (section?: QuotationPresenceSection) => void
  lockItemCell: (rowId: string, field: QuotationItemCellField) => void
  releaseItemCell: (rowId: string, field: QuotationItemCellField) => void
  isConnected: boolean
}

/**
 * Eventos emitidos por el servidor tras confirmar una mutación (ver
 * lib/server/realtime/broadcast.ts y las rutas de cotizaciones) -- SIEMPRE
 * después de que Postgres ya commiteó, nunca antes. Son la señal para
 * reconciliar de inmediato en vez de esperar el heartbeat periódico. No
 * llevan `user_id`: `item_confirmed` sí lleva `mutation_id`, así que quien
 * generó ese id puede reconocer su propia confirmación y no re-reconciliar
 * contra sí mismo; general/totales/notas no tienen forma de distinguir
 * autor, así que toda confirmación (propia o ajena) dispara la
 * reconciliación -- inofensivo, solo repite una lectura que ya iba a pasar.
 */
export interface ItemConfirmedPayload {
  cotizacion_id: string
  /** `null` en operaciones que ya no tienen una fila puntual, como `bulk`. */
  item_id: string | null
  revision: number | null
  mutation_id: string | null
  at: string
  /**
   * Ausente = 'update' (compatibilidad con clientes/servidores previos a Fase
   * 6A, que solo emitían esto desde el PATCH). No cambia cómo reacciona el
   * cliente hoy -- `reconciliarConServidor()` ya reconstruye altas/bajas con
   * una relectura completa + merge, sin importar qué operación las causó --
   * pero deja la intención explícita en el evento para consumidores futuros.
   */
  operation?: 'create' | 'update' | 'delete' | 'bulk'
}

export interface SectionConfirmedPayload {
  cotizacion_id: string
  at: string
}

function getCellKey(entityId: string, field: QuotationItemCellField) {
  return `${entityId}:${field}`
}

// ============================================================================
// Awareness -- estado de Presence puro. Nunca datos de negocio, nunca decide
// conflictos, nunca bloquea una edición. Separado a propósito (Fase 6E/6.8) del
// estado de "eventos confirmados" más abajo: son dos conceptos distintos que
// comparten el mismo canal de Realtime por eficiencia (un solo join por
// cotización), no por acoplamiento -- cada uno tiene su propio reducer y su
// propio ciclo de vida de estado, y ninguno lee el estado del otro.
// ============================================================================

interface AwarenessState {
  rawOnlineUsers: QuotationPresenceUser[]
  isConnected: boolean
}

const initialAwarenessState: AwarenessState = {
  rawOnlineUsers: [],
  isConnected: false,
}

type AwarenessAction =
  | { type: 'reset' }
  | { type: 'sync_online_users'; users: QuotationPresenceUser[] }
  | { type: 'set_connected'; connected: boolean }

function awarenessReducer(state: AwarenessState, action: AwarenessAction): AwarenessState {
  switch (action.type) {
    case 'reset':
      return initialAwarenessState
    case 'sync_online_users':
      return { ...state, rawOnlineUsers: action.users }
    case 'set_connected':
      return { ...state, isConnected: action.connected }
    default:
      return state
  }
}

// ============================================================================
// Eventos confirmados por el SERVIDOR -- la señal de "hay datos nuevos en
// Postgres, reconcilia ya" (ver ItemConfirmedPayload arriba). Nunca cargan la
// partida/cotización completa, solo identidad + revisión; quien los consume
// (reconciliarConServidor en page.tsx) siempre relee contra la API, nunca aplica
// este payload como si fuera el dato real.
// ============================================================================

interface ConfirmedEventsState {
  latestItemConfirmed: ItemConfirmedPayload | null
  latestGeneralConfirmed: SectionConfirmedPayload | null
  latestTotalesConfirmed: SectionConfirmedPayload | null
  latestNotasConfirmed: SectionConfirmedPayload | null
}

const initialConfirmedEventsState: ConfirmedEventsState = {
  latestItemConfirmed: null,
  latestGeneralConfirmed: null,
  latestTotalesConfirmed: null,
  latestNotasConfirmed: null,
}

type ConfirmedEventsAction =
  | { type: 'reset' }
  | { type: 'item_confirmed'; payload: ItemConfirmedPayload }
  | { type: 'general_confirmed'; payload: SectionConfirmedPayload }
  | { type: 'totales_confirmed'; payload: SectionConfirmedPayload }
  | { type: 'notas_confirmed'; payload: SectionConfirmedPayload }

function confirmedEventsReducer(state: ConfirmedEventsState, action: ConfirmedEventsAction): ConfirmedEventsState {
  switch (action.type) {
    case 'reset':
      return initialConfirmedEventsState
    case 'item_confirmed':
      return { ...state, latestItemConfirmed: action.payload }
    case 'general_confirmed':
      return { ...state, latestGeneralConfirmed: action.payload }
    case 'totales_confirmed':
      return { ...state, latestTotalesConfirmed: action.payload }
    case 'notas_confirmed':
      return { ...state, latestNotasConfirmed: action.payload }
    default:
      return state
  }
}

/**
 * Presence pura -- awareness, nunca datos. Un solo `channel.track()` por cliente
 * lleva sección activa + celda enfocada (si aplica); Supabase Realtime sincroniza
 * ese estado a todos los demás clientes de forma confiable (protocolo de Presence,
 * no un broadcast ad-hoc). Antes (Fase 3-6D) "quién edita qué sección/celda" viajaba
 * por un `channel.send()` de broadcast aparte (`section_signal`/`item_cell_signal`):
 * ese envío cae a REST con 403 silencioso cuando el canal todavía no terminó de
 * unirse (`.catch(() => null)` se traga el error) -- la causa raíz, documentada desde
 * Fase 0, del test live que fallaba de forma intermitente esperando ese aviso. Fase
 * 6E lo retira: ya no hay un segundo canal de awareness que pueda perderse en
 * silencio, solo Presence, que si el join falla simplemente no tiene con qué
 * trackear -- no hay ventana donde el track "salga" pero se pierda.
 */
export function useQuotationPresence({
  cotizacionId,
  enabled,
  currentUser,
}: UseQuotationPresenceOptions): UseQuotationPresenceResult {
  const [awareness, dispatchAwareness] = useReducer(awarenessReducer, initialAwarenessState)
  const { rawOnlineUsers, isConnected } = awareness
  const [confirmedEvents, dispatchConfirmedEvent] = useReducer(confirmedEventsReducer, initialConfirmedEventsState)
  const { latestItemConfirmed, latestGeneralConfirmed, latestTotalesConfirmed, latestNotasConfirmed } = confirmedEvents
  const channelRef = useRef<RealtimeChannel | null>(null)
  const activeSectionRef = useRef<QuotationPresenceSection | null>(null)
  const activeCellRef = useRef<{ rowId: string; field: QuotationItemCellField } | null>(null)
  const presenceKeyRef = useRef('')

  const identity = useMemo(() => {
    const userId = currentUser?.id || currentUser?.email || `anon:${cotizacionId}`
    const email = currentUser?.email || ''
    const name = currentUser?.name || currentUser?.email || 'Usuario'
    return { userId, email, name }
  }, [cotizacionId, currentUser?.email, currentUser?.id, currentUser?.name])

  // `channel.track()` manda un push por el WebSocket y espera un ack; sin red de
  // reintento, un timeout/blip aislado (nunca vimos un error de la app en logs de CI,
  // solo el badge que no aparece -- consistente con una promesa rechazada y tragada
  // en silencio) deja al otro colaborador sin enterarse hasta el próximo cambio real
  // o el heartbeat de PRESENCE_HEARTBEAT_MS. Reintentar de inmediato, un par de veces,
  // cierra esa ventana sin cambiar qué se envía ni introducir un mecanismo nuevo.
  const trackPresence = useCallback((section: QuotationPresenceSection | null, cell: { rowId: string; field: QuotationItemCellField } | null) => {
    const channel = channelRef.current
    if (!channel) return

    const payload = {
      user_id: identity.userId,
      email: identity.email,
      name: identity.name,
      active_section: section,
      entity_id: cell?.rowId ?? null,
      field: cell?.field ?? null,
      online_at: new Date().toISOString(),
    }

    const intentar = (intentosRestantes: number): void => {
      void channel.track(payload).catch((error) => {
        if (intentosRestantes <= 0) {
          console.error('[useQuotationPresence] track() agotó reintentos', error)
          return
        }
        window.setTimeout(() => intentar(intentosRestantes - 1), 1_000)
      })
    }
    intentar(2)
  }, [identity.email, identity.name, identity.userId])

  const setActiveSection = useCallback((section: QuotationPresenceSection | null) => {
    activeSectionRef.current = section
    if (!enabled) return
    trackPresence(section, activeCellRef.current)
  }, [enabled, trackPresence])

  const releaseSection = useCallback((section?: QuotationPresenceSection) => {
    const previous = activeSectionRef.current
    if (section && previous !== section) return

    activeSectionRef.current = null
    if (!enabled) return
    trackPresence(null, activeCellRef.current)
  }, [enabled, trackPresence])

  const lockItemCell = useCallback((rowId: string, field: QuotationItemCellField) => {
    activeCellRef.current = { rowId, field }
    if (!enabled) return
    trackPresence(activeSectionRef.current, activeCellRef.current)
  }, [enabled, trackPresence])

  const releaseItemCell = useCallback((rowId: string, field: QuotationItemCellField) => {
    const current = activeCellRef.current
    if (current && (current.rowId !== rowId || current.field !== field)) return

    activeCellRef.current = null
    if (!enabled) return
    trackPresence(activeSectionRef.current, null)
  }, [enabled, trackPresence])

  // Red de última instancia para Presence, mismo espíritu que RECONCILIACION_MS en
  // page.tsx para los datos: `channel.track()` es fire-and-forget (`.catch(() =>
  // null)`), así que un diff perdido en el transporte (WebSocket bajo carga, blip de
  // red) puede dejar a otro colaborador sin enterarse de una sección/celda activa
  // hasta el próximo cambio real. Re-afirmar el estado actual cada cierto tiempo
  // autocura eso sin volver a depender de un polling de DATOS -- esto solo repite la
  // MISMA awareness que ya se trackeó, nunca relee ni decide nada.
  useEffect(() => {
    if (!enabled) return
    const heartbeat = window.setInterval(() => {
      trackPresence(activeSectionRef.current, activeCellRef.current)
    }, PRESENCE_HEARTBEAT_MS)
    return () => window.clearInterval(heartbeat)
  }, [enabled, trackPresence])

  useEffect(() => {
    if (!enabled) {
      dispatchAwareness({ type: 'reset' })
      dispatchConfirmedEvent({ type: 'reset' })
      return
    }

    let cancelled = false
    let cancelTokenRefresh: (() => void) | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0

    // Root cause confirmado en vivo (CI, 2026-09-10): el canal de un colaborador se
    // cae a CLOSED apenas arranca la sesión y, sin esto, se queda muerto para
    // siempre -- nada volvía a llamar `channel.subscribe()`. La ruta de DATOS
    // sobrevive porque RECONCILIACION_MS (page.tsx) es un poll de 20s independiente
    // del canal; Presence no tiene ningún respaldo así, así que un canal muerto
    // significa badges que nunca vuelven a aparecer por el resto de la sesión.
    // Reintentos de `trackPresence` (más abajo) no alcanzan solos: reintentar un
    // `track()` contra un canal ya CLOSED nunca va a funcionar.
    const connect = () => {
      if (cancelled) return

      const random = Math.random().toString(36).slice(2, 8)
      presenceKeyRef.current = `${identity.userId}-${random}`

      // Canal PRIVADO: requiere autorizar la sesión de Realtime (JWT corto
      // derivado de la sesión de NextAuth) antes de unirse -- ver
      // lib/realtime/authorize.ts y db/migrations/20260909_realtime_broadcast_authorization.sql.
      const channel = createPrivateChannel(`cotizacion:${cotizacionId}`, {
        presence: { key: presenceKeyRef.current },
      })

      channel.on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState<QuotationPresenceUser>()
        const users = Object.values(presenceState)
          .flatMap((entries) => entries)
          .filter(Boolean)
        dispatchAwareness({ type: 'sync_online_users', users })
      })

      channel.on('broadcast', { event: 'item_confirmed' }, ({ payload }) => {
        const confirmed = payload as ItemConfirmedPayload | undefined
        // `bulk` representa varias filas a la vez y por eso viaja sin item_id --
        // Fase 8: esto se descartaba aquí mismo antes de llegar al reducer, así
        // que el import masivo nunca disparaba reconciliación por esta vía en
        // los DEMÁS colaboradores (el propio emisor se actualiza solo con la
        // respuesta HTTP de su POST, sin depender de este evento). Terminaba
        // convergiendo igual por el poll de 20s -- pero eso es la red de
        // seguridad, no el camino primario.
        if (!confirmed?.cotizacion_id) return
        if (!confirmed.item_id && confirmed.operation !== 'bulk') return
        dispatchConfirmedEvent({ type: 'item_confirmed', payload: { ...confirmed } })
      })

      channel.on('broadcast', { event: 'general_confirmed' }, ({ payload }) => {
        const confirmed = payload as SectionConfirmedPayload | undefined
        if (!confirmed?.cotizacion_id) return
        dispatchConfirmedEvent({ type: 'general_confirmed', payload: { ...confirmed } })
      })

      channel.on('broadcast', { event: 'totales_confirmed' }, ({ payload }) => {
        const confirmed = payload as SectionConfirmedPayload | undefined
        if (!confirmed?.cotizacion_id) return
        dispatchConfirmedEvent({ type: 'totales_confirmed', payload: { ...confirmed } })
      })

      channel.on('broadcast', { event: 'notas_confirmed' }, ({ payload }) => {
        const confirmed = payload as SectionConfirmedPayload | undefined
        if (!confirmed?.cotizacion_id) return
        dispatchConfirmedEvent({ type: 'notas_confirmed', payload: { ...confirmed } })
      })

      const scheduleReconnect = () => {
        if (cancelled || reconnectTimer !== null) return
        reconnectAttempt += 1
        const delayMs = Math.min(1_000 * 2 ** (reconnectAttempt - 1), 10_000)
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          void supabaseBrowser.removeChannel(channel)
          if (channelRef.current === channel) channelRef.current = null
          connect()
        }, delayMs)
      }

      const join = async () => {
        // Si autorizar falla (red, endpoint caído), igual se intenta unir: el
        // join simplemente lo rechaza la política RLS -- Presence sencillamente no
        // tiene nada que trackear, sin la ventana de "se mandó pero se perdió en
        // silencio" que tenía el broadcast ad-hoc que este canal usaba antes.
        try {
          const ttlSeconds = await authorizeRealtime()
          if (!cancelled) cancelTokenRefresh = scheduleTokenRefresh(ttlSeconds)
        } catch (e) {
          console.error('[useQuotationPresence] No se pudo autorizar el canal de Realtime', e)
        }
        if (cancelled) return

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            reconnectAttempt = 0
            dispatchAwareness({ type: 'set_connected', connected: true })
            await channel.track({
              user_id: identity.userId,
              email: identity.email,
              name: identity.name,
              active_section: activeSectionRef.current,
              entity_id: activeCellRef.current?.rowId ?? null,
              field: activeCellRef.current?.field ?? null,
              online_at: new Date().toISOString(),
            })
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('[useQuotationPresence] canal de Realtime perdió la conexión, reconectando', status)
            dispatchAwareness({ type: 'set_connected', connected: false })
            scheduleReconnect()
          }
        })
      }

      channelRef.current = channel
      void join()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      cancelTokenRefresh?.()
      dispatchAwareness({ type: 'reset' })
      dispatchConfirmedEvent({ type: 'reset' })
      const channel = channelRef.current
      if (channel) {
        void channel.untrack().catch(() => null)
        void supabaseBrowser.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [cotizacionId, enabled, identity.email, identity.name, identity.userId])

  const onlineUsers = rawOnlineUsers

  const sectionEditors = useMemo(() => {
    const editors: Partial<Record<QuotationPresenceSection, QuotationPresenceUser>> = {}

    onlineUsers.forEach((user) => {
      if (!user.active_section) return
      if (user.user_id === identity.userId) return
      if (!editors[user.active_section]) {
        editors[user.active_section] = user
      }
    })

    return editors
  }, [identity.userId, onlineUsers])

  const itemCellEditors = useMemo(() => {
    const editors: Record<string, QuotationPresenceUser> = {}

    onlineUsers.forEach((user) => {
      if (!user.entity_id || !user.field) return
      if (user.user_id === identity.userId) return
      const key = getCellKey(user.entity_id, user.field)
      if (!editors[key]) editors[key] = user
    })

    return editors
  }, [identity.userId, onlineUsers])

  return {
    onlineUsers,
    sectionEditors,
    itemCellEditors,
    latestItemConfirmed,
    latestGeneralConfirmed,
    latestTotalesConfirmed,
    latestNotasConfirmed,
    setActiveSection,
    releaseSection,
    lockItemCell,
    releaseItemCell,
    isConnected,
  }
}
