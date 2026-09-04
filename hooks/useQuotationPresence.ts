'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase-browser'
import type { ItemCotizacion } from '@/lib/types'

export type QuotationPresenceSection = 'notas' | 'general' | 'partidas' | 'totales'
export type QuotationItemCellField = 'categoria' | 'descripcion' | 'cantidad' | 'precio_unitario' | 'responsable_id' | 'x_pagar'
export type QuotationItemRowMode = 'new_row' | 'row_action'
export type QuotationItemMutationAction = 'upsert' | 'delete'

interface CurrentUser {
  id?: string | null
  email?: string | null
  name?: string | null
}

export interface QuotationPresenceUser {
  user_id: string
  email: string
  name: string
  active_section: QuotationPresenceSection | null
  online_at: string
}

export interface QuotationItemRowEditor extends QuotationPresenceUser {
  row_id: string
  mode: QuotationItemRowMode
}

export interface QuotationItemMutationPayload {
  action: QuotationItemMutationAction
  row_id: string
  item?: ItemCotizacion | null
  user_id: string
  email: string
  name: string
  at: string
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
  itemRowEditors: Record<string, QuotationItemRowEditor>
  latestItemMutation: QuotationItemMutationPayload | null
  savedSections: Partial<Record<QuotationPresenceSection, number>>
  setActiveSection: (section: QuotationPresenceSection | null) => void
  releaseSection: (section?: QuotationPresenceSection) => void
  lockItemCell: (rowId: string, field: QuotationItemCellField) => void
  releaseItemCell: (rowId: string, field: QuotationItemCellField) => void
  lockItemRow: (rowId: string, mode: QuotationItemRowMode) => void
  releaseItemRow: (rowId: string) => void
  broadcastItemMutation: (payload: { action: QuotationItemMutationAction; row_id: string; item?: ItemCotizacion | null }) => void
  markSectionSaved: (section: QuotationPresenceSection) => void
  isConnected: boolean
}

type SectionSignalStatus = 'editing' | 'released'

interface SectionSignalPayload {
  status: SectionSignalStatus
  section: QuotationPresenceSection
  user_id: string
  email: string
  name: string
  at: string
}

interface SectionSavedPayload {
  section: QuotationPresenceSection
  user_id: string
  email: string
  name: string
  at: string
}

interface ItemCellSignalPayload {
  status: SectionSignalStatus
  row_id: string
  field: QuotationItemCellField
  user_id: string
  email: string
  name: string
  at: string
}

interface ItemRowSignalPayload {
  status: SectionSignalStatus
  row_id: string
  mode: QuotationItemRowMode
  user_id: string
  email: string
  name: string
  at: string
}

function getCellLockKey(rowId: string, field: QuotationItemCellField) {
  return `${rowId}:${field}`
}

interface PresenceState {
  rawOnlineUsers: QuotationPresenceUser[]
  activeSectionOverrides: Record<string, QuotationPresenceSection | null>
  savedSections: Partial<Record<QuotationPresenceSection, number>>
  itemCellEditors: Record<string, QuotationPresenceUser>
  itemRowEditors: Record<string, QuotationItemRowEditor>
  latestItemMutation: QuotationItemMutationPayload | null
  isConnected: boolean
}

const initialPresenceState: PresenceState = {
  rawOnlineUsers: [],
  activeSectionOverrides: {},
  savedSections: {},
  itemCellEditors: {},
  itemRowEditors: {},
  latestItemMutation: null,
  isConnected: false,
}

type PresenceAction =
  | { type: 'reset' }
  | { type: 'sync_online_users'; users: QuotationPresenceUser[] }
  | { type: 'section_signal'; userId: string; section: QuotationPresenceSection | null }
  | { type: 'item_cell_signal'; key: string; editor: QuotationPresenceUser | null }
  | { type: 'item_row_signal'; rowId: string; editor: QuotationItemRowEditor | null }
  | { type: 'item_mutation'; payload: QuotationItemMutationPayload }
  | { type: 'section_saved'; userId: string; section: QuotationPresenceSection }
  | { type: 'set_connected'; connected: boolean }

/**
 * Consolida los 7 estados de presencia en una sola transición por evento, en vez de
 * varios setState seguidos — así el reset (`!enabled` / cleanup del efecto) es UNA sola
 * actualización de estado, no varias, evitando el patrón que dispara
 * react-hooks/set-state-in-effect. `reset` devuelve siempre la misma referencia de
 * `initialPresenceState`, así que si el estado ya estaba en default, useReducer hace
 * bail-out del render automáticamente (misma optimización que antes tenían las guardas
 * manuales por campo).
 */
function presenceReducer(state: PresenceState, action: PresenceAction): PresenceState {
  switch (action.type) {
    case 'reset':
      return initialPresenceState
    case 'sync_online_users':
      return { ...state, rawOnlineUsers: action.users }
    case 'section_signal':
      return {
        ...state,
        activeSectionOverrides: { ...state.activeSectionOverrides, [action.userId]: action.section },
      }
    case 'item_cell_signal': {
      const next = { ...state.itemCellEditors }
      if (action.editor) next[action.key] = action.editor
      else delete next[action.key]
      return { ...state, itemCellEditors: next }
    }
    case 'item_row_signal': {
      const next = { ...state.itemRowEditors }
      if (action.editor) next[action.rowId] = action.editor
      else delete next[action.rowId]
      return { ...state, itemRowEditors: next }
    }
    case 'item_mutation':
      return { ...state, latestItemMutation: action.payload }
    case 'section_saved':
      return {
        ...state,
        activeSectionOverrides: { ...state.activeSectionOverrides, [action.userId]: null },
        savedSections: {
          ...state.savedSections,
          [action.section]: (state.savedSections[action.section] || 0) + 1,
        },
      }
    case 'set_connected':
      return { ...state, isConnected: action.connected }
    default:
      return state
  }
}

export function useQuotationPresence({
  cotizacionId,
  enabled,
  currentUser,
}: UseQuotationPresenceOptions): UseQuotationPresenceResult {
  const [state, dispatch] = useReducer(presenceReducer, initialPresenceState)
  const { rawOnlineUsers, activeSectionOverrides, savedSections, itemCellEditors, itemRowEditors, latestItemMutation, isConnected } = state
  const channelRef = useRef<RealtimeChannel | null>(null)
  const activeSectionRef = useRef<QuotationPresenceSection | null>(null)
  const presenceKeyRef = useRef('')

  const identity = useMemo(() => {
    const userId = currentUser?.id || currentUser?.email || `anon:${cotizacionId}`
    const email = currentUser?.email || ''
    const name = currentUser?.name || currentUser?.email || 'Usuario'
    return { userId, email, name }
  }, [cotizacionId, currentUser?.email, currentUser?.id, currentUser?.name])

  const trackPresence = useCallback((section: QuotationPresenceSection | null) => {
    const channel = channelRef.current
    if (!channel) return

    void channel.track({
      user_id: identity.userId,
      email: identity.email,
      name: identity.name,
      active_section: section,
      online_at: new Date().toISOString(),
    }).catch(() => null)
  }, [identity.email, identity.name, identity.userId])

  const sendSectionSignal = useCallback((status: SectionSignalStatus, section: QuotationPresenceSection) => {
    const channel = channelRef.current
    if (!channel) return

    void channel.send({
      type: 'broadcast',
      event: 'section_signal',
      payload: {
        status,
        section,
        user_id: identity.userId,
        email: identity.email,
        name: identity.name,
        at: new Date().toISOString(),
      } satisfies SectionSignalPayload,
    }).catch(() => null)
  }, [identity.email, identity.name, identity.userId])

  const sendItemCellSignal = useCallback((status: SectionSignalStatus, rowId: string, field: QuotationItemCellField) => {
    const channel = channelRef.current
    if (!channel) return

    void channel.send({
      type: 'broadcast',
      event: 'item_cell_signal',
      payload: {
        status,
        row_id: rowId,
        field,
        user_id: identity.userId,
        email: identity.email,
        name: identity.name,
        at: new Date().toISOString(),
      } satisfies ItemCellSignalPayload,
    }).catch(() => null)
  }, [identity.email, identity.name, identity.userId])

  const sendItemRowSignal = useCallback((status: SectionSignalStatus, rowId: string, mode: QuotationItemRowMode) => {
    const channel = channelRef.current
    if (!channel) return

    void channel.send({
      type: 'broadcast',
      event: 'item_row_signal',
      payload: {
        status,
        row_id: rowId,
        mode,
        user_id: identity.userId,
        email: identity.email,
        name: identity.name,
        at: new Date().toISOString(),
      } satisfies ItemRowSignalPayload,
    }).catch(() => null)
  }, [identity.email, identity.name, identity.userId])

  const broadcastItemMutation = useCallback((payload: { action: QuotationItemMutationAction; row_id: string; item?: ItemCotizacion | null }) => {
    const channel = channelRef.current
    if (!channel) return

    void channel.send({
      type: 'broadcast',
      event: 'item_mutation',
      payload: {
        ...payload,
        user_id: identity.userId,
        email: identity.email,
        name: identity.name,
        at: new Date().toISOString(),
      } satisfies QuotationItemMutationPayload,
    }).catch(() => null)
  }, [identity.email, identity.name, identity.userId])

  const markSectionSaved = useCallback((section: QuotationPresenceSection) => {
    const channel = channelRef.current
    if (!channel) return

    void channel.send({
      type: 'broadcast',
      event: 'section_saved',
      payload: {
        section,
        user_id: identity.userId,
        email: identity.email,
        name: identity.name,
        at: new Date().toISOString(),
      } satisfies SectionSavedPayload,
    }).catch(() => null)
  }, [identity.email, identity.name, identity.userId])

  const setActiveSection = useCallback((section: QuotationPresenceSection | null) => {
    const previous = activeSectionRef.current
    activeSectionRef.current = section
    if (!enabled) return

    if (previous && previous !== section) {
      sendSectionSignal('released', previous)
    }

    if (section) {
      sendSectionSignal('editing', section)
    }

    trackPresence(section)
  }, [enabled, sendSectionSignal, trackPresence])

  const releaseSection = useCallback((section?: QuotationPresenceSection) => {
    const previous = activeSectionRef.current
    const sectionToRelease = section || previous

    if (section && previous !== section) {
      return
    }

    activeSectionRef.current = null
    if (!enabled) return
    if (sectionToRelease) {
      sendSectionSignal('released', sectionToRelease)
    }
    trackPresence(null)
  }, [enabled, sendSectionSignal, trackPresence])

  const lockItemCell = useCallback((rowId: string, field: QuotationItemCellField) => {
    if (!enabled) return
    sendItemCellSignal('editing', rowId, field)
  }, [enabled, sendItemCellSignal])

  const releaseItemCell = useCallback((rowId: string, field: QuotationItemCellField) => {
    if (!enabled) return
    sendItemCellSignal('released', rowId, field)
  }, [enabled, sendItemCellSignal])

  const lockItemRow = useCallback((rowId: string, mode: QuotationItemRowMode) => {
    if (!enabled) return
    sendItemRowSignal('editing', rowId, mode)
  }, [enabled, sendItemRowSignal])

  const releaseItemRow = useCallback((rowId: string) => {
    if (!enabled) return
    sendItemRowSignal('released', rowId, 'row_action')
  }, [enabled, sendItemRowSignal])

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: 'reset' })
      return
    }

    const random = Math.random().toString(36).slice(2, 8)
    presenceKeyRef.current = `${identity.userId}-${random}`

    const channel = supabaseBrowser.channel(`cotizacion:${cotizacionId}`, {
      config: {
        presence: { key: presenceKeyRef.current },
      },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState<QuotationPresenceUser>()
      const users = Object.values(presenceState)
        .flatMap((entries) => entries)
        .filter(Boolean)
      dispatch({ type: 'sync_online_users', users })
    })

    channel.on('broadcast', { event: 'section_signal' }, ({ payload }) => {
      const signal = payload as SectionSignalPayload | undefined
      if (!signal?.user_id || signal.user_id === identity.userId) return

      dispatch({
        type: 'section_signal',
        userId: signal.user_id,
        section: signal.status === 'editing' ? signal.section : null,
      })
    })

    channel.on('broadcast', { event: 'item_cell_signal' }, ({ payload }) => {
      const signal = payload as ItemCellSignalPayload | undefined
      if (!signal?.user_id || signal.user_id === identity.userId) return

      const key = getCellLockKey(signal.row_id, signal.field)
      dispatch({
        type: 'item_cell_signal',
        key,
        editor:
          signal.status === 'editing'
            ? {
                user_id: signal.user_id,
                email: signal.email,
                name: signal.name,
                active_section: 'partidas',
                online_at: signal.at,
              }
            : null,
      })
    })

    channel.on('broadcast', { event: 'item_row_signal' }, ({ payload }) => {
      const signal = payload as ItemRowSignalPayload | undefined
      if (!signal?.user_id || signal.user_id === identity.userId) return

      dispatch({
        type: 'item_row_signal',
        rowId: signal.row_id,
        editor:
          signal.status === 'editing'
            ? {
                row_id: signal.row_id,
                mode: signal.mode,
                user_id: signal.user_id,
                email: signal.email,
                name: signal.name,
                active_section: 'partidas',
                online_at: signal.at,
              }
            : null,
      })
    })

    channel.on('broadcast', { event: 'item_mutation' }, ({ payload }) => {
      const mutation = payload as QuotationItemMutationPayload | undefined
      if (!mutation?.user_id || mutation.user_id === identity.userId) return
      dispatch({ type: 'item_mutation', payload: { ...mutation } })
    })

    channel.on('broadcast', { event: 'section_saved' }, ({ payload }) => {
      const saved = payload as SectionSavedPayload | undefined
      if (!saved?.user_id || saved.user_id === identity.userId) return

      dispatch({ type: 'section_saved', userId: saved.user_id, section: saved.section })
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        dispatch({ type: 'set_connected', connected: true })
        await channel.track({
          user_id: identity.userId,
          email: identity.email,
          name: identity.name,
          active_section: activeSectionRef.current,
          online_at: new Date().toISOString(),
        })
        return
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        dispatch({ type: 'set_connected', connected: false })
      }
    })

    channelRef.current = channel

    return () => {
      dispatch({ type: 'reset' })
      void channel.untrack().catch(() => null)
      void supabaseBrowser.removeChannel(channel)
      channelRef.current = null
    }
  }, [cotizacionId, enabled, identity.email, identity.name, identity.userId])

  const onlineUsers = useMemo(() => {
    return rawOnlineUsers.map((user) => ({
      ...user,
      active_section: Object.prototype.hasOwnProperty.call(activeSectionOverrides, user.user_id)
        ? activeSectionOverrides[user.user_id]
        : user.active_section,
    }))
  }, [activeSectionOverrides, rawOnlineUsers])

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

  return {
    onlineUsers,
    sectionEditors,
    itemCellEditors,
    itemRowEditors,
    latestItemMutation,
    savedSections,
    setActiveSection,
    releaseSection,
    lockItemCell,
    releaseItemCell,
    lockItemRow,
    releaseItemRow,
    broadcastItemMutation,
    markSectionSaved,
    isConnected,
  }
}
