'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase-browser'

export type QuotationPresenceSection = 'notas' | 'general' | 'partidas' | 'totales'

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

interface UseQuotationPresenceOptions {
  cotizacionId: string
  enabled: boolean
  currentUser: CurrentUser | null
}

interface UseQuotationPresenceResult {
  onlineUsers: QuotationPresenceUser[]
  sectionEditors: Partial<Record<QuotationPresenceSection, QuotationPresenceUser>>
  setActiveSection: (section: QuotationPresenceSection | null) => void
  releaseSection: () => void
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

export function useQuotationPresence({
  cotizacionId,
  enabled,
  currentUser,
}: UseQuotationPresenceOptions): UseQuotationPresenceResult {
  const [rawOnlineUsers, setRawOnlineUsers] = useState<QuotationPresenceUser[]>([])
  const [activeSectionOverrides, setActiveSectionOverrides] = useState<Record<string, QuotationPresenceSection | null>>({})
  const [isConnected, setIsConnected] = useState(false)
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

  const releaseSection = useCallback(() => {
    const previous = activeSectionRef.current
    activeSectionRef.current = null
    if (!enabled) return
    if (previous) {
      sendSectionSignal('released', previous)
    }
    trackPresence(null)
  }, [enabled, sendSectionSignal, trackPresence])

  useEffect(() => {
    if (!enabled) {
      setRawOnlineUsers([])
      setActiveSectionOverrides({})
      setIsConnected(false)
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
      const state = channel.presenceState<QuotationPresenceUser>()
      const users = Object.values(state)
        .flatMap((entries) => entries)
        .filter(Boolean)
      setRawOnlineUsers(users)
    })

    channel.on('broadcast', { event: 'section_signal' }, ({ payload }) => {
      const signal = payload as SectionSignalPayload | undefined
      if (!signal?.user_id || signal.user_id === identity.userId) return

      setActiveSectionOverrides((prev) => ({
        ...prev,
        [signal.user_id]: signal.status === 'editing' ? signal.section : null,
      }))
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true)
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
        setIsConnected(false)
      }
    })

    channelRef.current = channel

    return () => {
      setIsConnected(false)
      setRawOnlineUsers([])
      setActiveSectionOverrides({})
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
    setActiveSection,
    releaseSection,
    isConnected,
  }
}
