'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useRealtimeChannel } from '@/lib/realtime/useRealtimeChannel'

export type QuotationPresenceSection = 'notas' | 'general' | 'partidas' | 'totales'
export type QuotationItemCellField = 'categoria' | 'descripcion' | 'cantidad' | 'precio_unitario' | 'responsable_id' | 'x_pagar'

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
  // Clave de la última awareness publicada (sección + celda) y su `online_at`:
  // `online_at` solo cambia cuando la awareness cambia de verdad, así el
  // payload de una llamada repetida (foco de otra celda de la misma fila ya
  // publicada, cada tecla vía `lockItemCell`) es idéntico y el publicador no
  // lo reenvía -- docs/decisions/016.
  const publishedAwarenessRef = useRef<{ key: string; onlineAt: string } | null>(null)

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

  // La publicación del registro propio en cada unión/reconexión la hace
  // `useRealtimeChannel` (re-publica el último estado deseado al llegar a
  // SUBSCRIBED); aquí solo se refleja el estado de conexión.
  const handleSubscribed = useCallback(() => {
    dispatchAwareness({ type: 'set_connected', connected: true })
  }, [])

  const handleDisconnected = useCallback(() => {
    dispatchAwareness({ type: 'set_connected', connected: false })
  }, [])

  const handleSessionEnd = useCallback(() => {
    // Una sesión nueva (otro topic, re-habilitar) debe volver a publicar su
    // awareness aunque sea idéntica a la anterior.
    publishedAwarenessRef.current = null
    dispatchAwareness({ type: 'reset' })
    dispatchConfirmedEvent({ type: 'reset' })
  }, [])

  const { publishPresence } = useRealtimeChannel({
    topic: enabled ? `cotizacion:${cotizacionId}` : null,
    enabled,
    presenceKeyPrefix: identity.userId,
    onChannelCreated: handleChannelCreated,
    onSubscribed: handleSubscribed,
    onDisconnected: handleDisconnected,
    onSessionEnd: handleSessionEnd,
  })

  // Único punto de publicación de la awareness propia. El envío real (agrupado,
  // deduplicado, dentro del presupuesto de Presence del servidor y con
  // reintentos acotados) lo hace `publishPresence` -- docs/decisions/016. Antes
  // cada llamada era un `channel.track()` directo (una por tecla en Partidas) más
  // un heartbeat cada 15 s: excedía el límite de 5 eventos/30 s y el servidor
  // cerraba el canal.
  const trackPresence = useCallback((section: QuotationPresenceSection | null, cell: { rowId: string; field: QuotationItemCellField } | null) => {
    const key = JSON.stringify([section, cell?.rowId ?? null, cell?.field ?? null])
    const previous = publishedAwarenessRef.current
    const onlineAt = previous && previous.key === key ? previous.onlineAt : new Date().toISOString()
    publishedAwarenessRef.current = { key, onlineAt }
    publishPresence({
      user_id: identity.userId,
      email: identity.email,
      name: identity.name,
      active_section: section,
      entity_id: cell?.rowId ?? null,
      field: cell?.field ?? null,
      online_at: onlineAt,
    })
  }, [identity.email, identity.name, identity.userId, publishPresence])

  // Estado inicial de cada sesión de canal (montaje, otra cotización, re-habilitar,
  // cambio de identidad): el fin de sesión anterior borra el estado deseado del
  // publicador, así que se vuelve a declarar aquí -- es lo que se publica al unirse
  // mientras nadie haya enfocado nada todavía.
  useEffect(() => {
    if (!enabled) return
    trackPresence(activeSectionRef.current, activeCellRef.current)
  }, [cotizacionId, enabled, trackPresence])

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
    // ve "X está editando esta celda" indefinidamente, aunque X ya ni siquiera esté
    // en Partidas.
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
      // abruptamente antes del release, envío todavía agrupado o esperando presupuesto).
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
