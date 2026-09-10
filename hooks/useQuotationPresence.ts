'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { authorizeRealtime, createPrivateChannel, scheduleTokenRefresh } from '@/lib/realtime/authorize'

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

interface PresenceState {
  rawOnlineUsers: QuotationPresenceUser[]
  latestItemConfirmed: ItemConfirmedPayload | null
  latestGeneralConfirmed: SectionConfirmedPayload | null
  latestTotalesConfirmed: SectionConfirmedPayload | null
  latestNotasConfirmed: SectionConfirmedPayload | null
  isConnected: boolean
}

const initialPresenceState: PresenceState = {
  rawOnlineUsers: [],
  latestItemConfirmed: null,
  latestGeneralConfirmed: null,
  latestTotalesConfirmed: null,
  latestNotasConfirmed: null,
  isConnected: false,
}

type PresenceAction =
  | { type: 'reset' }
  | { type: 'sync_online_users'; users: QuotationPresenceUser[] }
  | { type: 'item_confirmed'; payload: ItemConfirmedPayload }
  | { type: 'general_confirmed'; payload: SectionConfirmedPayload }
  | { type: 'totales_confirmed'; payload: SectionConfirmedPayload }
  | { type: 'notas_confirmed'; payload: SectionConfirmedPayload }
  | { type: 'set_connected'; connected: boolean }

/**
 * Consolida los estados de presencia en una sola transición por evento, en vez de
 * varios setState seguidos — así el reset (`!enabled` / cleanup del efecto) es UNA sola
 * actualización de estado, no varias, evitando el patrón que dispara
 * react-hooks/set-state-in-effect. `reset` devuelve siempre la misma referencia de
 * `initialPresenceState`, así que si el estado ya estaba en default, useReducer hace
 * bail-out del render automáticamente.
 */
function presenceReducer(state: PresenceState, action: PresenceAction): PresenceState {
  switch (action.type) {
    case 'reset':
      return initialPresenceState
    case 'sync_online_users':
      return { ...state, rawOnlineUsers: action.users }
    case 'item_confirmed':
      return { ...state, latestItemConfirmed: action.payload }
    case 'general_confirmed':
      return { ...state, latestGeneralConfirmed: action.payload }
    case 'totales_confirmed':
      return { ...state, latestTotalesConfirmed: action.payload }
    case 'notas_confirmed':
      return { ...state, latestNotasConfirmed: action.payload }
    case 'set_connected':
      return { ...state, isConnected: action.connected }
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
  const [state, dispatch] = useReducer(presenceReducer, initialPresenceState)
  const { rawOnlineUsers, latestItemConfirmed, latestGeneralConfirmed, latestTotalesConfirmed, latestNotasConfirmed, isConnected } = state
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

  const trackPresence = useCallback((section: QuotationPresenceSection | null, cell: { rowId: string; field: QuotationItemCellField } | null) => {
    const channel = channelRef.current
    if (!channel) return

    void channel.track({
      user_id: identity.userId,
      email: identity.email,
      name: identity.name,
      active_section: section,
      entity_id: cell?.rowId ?? null,
      field: cell?.field ?? null,
      online_at: new Date().toISOString(),
    }).catch(() => null)
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

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: 'reset' })
      return
    }

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
      dispatch({ type: 'sync_online_users', users })
    })

    channel.on('broadcast', { event: 'item_confirmed' }, ({ payload }) => {
      const confirmed = payload as ItemConfirmedPayload | undefined
      if (!confirmed?.item_id) return
      dispatch({ type: 'item_confirmed', payload: { ...confirmed } })
    })

    channel.on('broadcast', { event: 'general_confirmed' }, ({ payload }) => {
      const confirmed = payload as SectionConfirmedPayload | undefined
      if (!confirmed?.cotizacion_id) return
      dispatch({ type: 'general_confirmed', payload: { ...confirmed } })
    })

    channel.on('broadcast', { event: 'totales_confirmed' }, ({ payload }) => {
      const confirmed = payload as SectionConfirmedPayload | undefined
      if (!confirmed?.cotizacion_id) return
      dispatch({ type: 'totales_confirmed', payload: { ...confirmed } })
    })

    channel.on('broadcast', { event: 'notas_confirmed' }, ({ payload }) => {
      const confirmed = payload as SectionConfirmedPayload | undefined
      if (!confirmed?.cotizacion_id) return
      dispatch({ type: 'notas_confirmed', payload: { ...confirmed } })
    })

    let cancelled = false
    let cancelTokenRefresh: (() => void) | null = null

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
          dispatch({ type: 'set_connected', connected: true })
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
          dispatch({ type: 'set_connected', connected: false })
        }
      })
    }

    channelRef.current = channel
    void join()

    return () => {
      cancelled = true
      cancelTokenRefresh?.()
      dispatch({ type: 'reset' })
      void channel.untrack().catch(() => null)
      void supabaseBrowser.removeChannel(channel)
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
