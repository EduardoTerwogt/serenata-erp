'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useRealtimeChannel } from '@/lib/realtime/useRealtimeChannel'

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
  const activeSectionRef = useRef<QuotationPresenceSection | null>(null)
  const activeCellRef = useRef<{ rowId: string; field: QuotationItemCellField } | null>(null)
  // Fase 8 (hardening pre-Proyectos): ids de los `setTimeout` de reintento de
  // `trackPresence` todavía pendientes -- sin esto, un reintento programado
  // justo antes de un unmount/reconexión sobrevivía y podía disparar `.track()`
  // sobre un canal ya reemplazado. Se limpian en `clearPendingTrackRetries`,
  // más abajo (Fase 8.7 Bloque 2: antes solo se limpiaban en `onSessionEnd`,
  // no en una reconexión interna).
  const pendingTrackRetriesRef = useRef<Set<number>>(new Set())

  const identity = useMemo(() => {
    const userId = currentUser?.id || currentUser?.email || `anon:${cotizacionId}`
    const email = currentUser?.email || ''
    const name = currentUser?.name || currentUser?.email || 'Usuario'
    return { userId, email, name }
  }, [cotizacionId, currentUser?.email, currentUser?.id, currentUser?.name])

  // Infraestructura de canal (conexión, autorización, reconexión con backoff,
  // refresco de token, cleanup) -- extraída a lib/realtime/useRealtimeChannel.ts
  // (Fase 8) porque no tiene nada específico de cotizaciones. Este hook solo le
  // pasa QUÉ escuchar (presence sync + los 4 broadcasts `*_confirmed`) y CUÁNDO
  // reaccionar (subscribed/disconnected/session-end) -- el protocolo de
  // Presence y de mutaciones sigue siendo específico de cotizaciones, no se
  // extrae todavía (deuda intencional hasta tener un segundo consumidor real).
  const handleChannelCreated = useCallback((channel: RealtimeChannel) => {
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
  }, [])

  const handleSubscribed = useCallback(async (channel: RealtimeChannel) => {
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
  }, [identity.email, identity.name, identity.userId])

  // Fase 8.7 (Bloque 2): única función de limpieza de los retries de
  // trackPresence, usada tanto en reconexión interna (onDisconnected) como en
  // unmount/session end (onSessionEnd). Antes solo corría en onSessionEnd --
  // una reconexión interna (onDisconnected) nunca la ejecutaba, así que un
  // retry agendado justo antes de que el canal cayera sobrevivía a la
  // reconexión y terminaba llamando `.track()` sobre el canal viejo, ya
  // retirado por `useRealtimeChannel`.
  const clearPendingTrackRetries = useCallback(() => {
    const pendingTrackRetries = pendingTrackRetriesRef.current
    pendingTrackRetries.forEach((timeoutId) => window.clearTimeout(timeoutId))
    pendingTrackRetries.clear()
  }, [])

  const handleDisconnected = useCallback(() => {
    clearPendingTrackRetries()
    dispatchAwareness({ type: 'set_connected', connected: false })
  }, [clearPendingTrackRetries])

  const handleSessionEnd = useCallback(() => {
    clearPendingTrackRetries()
    dispatchAwareness({ type: 'reset' })
    dispatchConfirmedEvent({ type: 'reset' })
  }, [clearPendingTrackRetries])

  const { channelRef } = useRealtimeChannel({
    topic: enabled ? `cotizacion:${cotizacionId}` : null,
    enabled,
    presenceKeyPrefix: identity.userId,
    onChannelCreated: handleChannelCreated,
    onSubscribed: handleSubscribed,
    onDisconnected: handleDisconnected,
    onSessionEnd: handleSessionEnd,
  })

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
        // El propio `.track()` puede seguir en vuelo cuando el canal ya cayó
        // y `useRealtimeChannel` lo reemplazó -- `clearPendingTrackRetries`
        // solo alcanza a cancelar los retries YA agendados en ese instante,
        // no una promesa que rechaza después. Este chequeo cierra ese residual:
        // si `channelRef.current` ya no es este `channel`, no tiene sentido
        // reintentar contra uno retirado.
        if (channelRef.current !== channel) return
        if (intentosRestantes <= 0) {
          console.error('[useQuotationPresence] track() agotó reintentos', error)
          return
        }
        const timeoutId = window.setTimeout(() => {
          pendingTrackRetriesRef.current.delete(timeoutId)
          if (channelRef.current !== channel) return
          intentar(intentosRestantes - 1)
        }, 1_000)
        pendingTrackRetriesRef.current.add(timeoutId)
      })
    }
    intentar(2)
  }, [channelRef, identity.email, identity.name, identity.userId])

  const setActiveSection = useCallback((section: QuotationPresenceSection | null) => {
    activeSectionRef.current = section
    if (!enabled) return
    trackPresence(section, activeCellRef.current)
  }, [enabled, trackPresence])

  const releaseSection = useCallback((section?: QuotationPresenceSection) => {
    const previous = activeSectionRef.current
    if (section && previous !== section) return

    activeSectionRef.current = null
    // `activeCellRef` solo lo toca `lockItemCell`, llamado nada más desde el foco de
    // celdas de Partidas -- soltar cualquier sección ya lo encuentra en `null` salvo
    // que se esté saliendo de Partidas. Sin este reset, un usuario que abandona la
    // sección sigue publicando la última celda que enfocó ahí: el otro colaborador
    // ve "X está editando esta celda" indefinidamente (el heartbeat solo repite el
    // mismo payload), aunque X ya ni siquiera esté en Partidas.
    activeCellRef.current = null
    if (!enabled) return
    trackPresence(null, null)
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
      // Defensa adicional a `releaseSection` limpiando `entity_id`/`field`: cubre
      // cualquier otra ventana donde Presence quede desincronizada (pestaña cerrada
      // abruptamente antes del release, blip de red antes del próximo heartbeat).
      if (user.active_section !== 'partidas') return
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
