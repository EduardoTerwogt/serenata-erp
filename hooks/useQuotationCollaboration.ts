'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { CotizacionCollabActivityEvent, CotizacionCollabSection } from '@/lib/types'

interface CurrentUser {
  id?: string | null
  email?: string | null
  name?: string | null
}

interface PresencePayload {
  user_id: string
  email: string
  name: string
  active_section: CotizacionCollabSection | null
  online_at: string
}

interface UseQuotationCollaborationOptions {
  cotizacionId: string
  enabled: boolean
  currentUser: CurrentUser | null
}

interface UseQuotationCollaborationResult {
  onlineUsers: PresencePayload[]
  sectionEditors: Partial<Record<CotizacionCollabSection, PresencePayload>>
  activeSection: CotizacionCollabSection | null
  setActiveSection: (section: CotizacionCollabSection | null) => void
  activity: CotizacionCollabActivityEvent[]
  reportSave: () => Promise<void>
}

const MAX_ACTIVITY_EVENTS = 40

function normalizeEvent(input: Partial<CotizacionCollabActivityEvent>): CotizacionCollabActivityEvent {
  return {
    id: input.id || crypto.randomUUID(),
    cotizacion_id: input.cotizacion_id || '',
    user_id: input.user_id || 'anon',
    user_email: input.user_email || '',
    user_name: input.user_name || 'Usuario',
    event_type: input.event_type || 'join',
    section: input.section ?? null,
    metadata: input.metadata ?? null,
    created_at: input.created_at || new Date().toISOString(),
  }
}

export function useQuotationCollaboration({
  cotizacionId,
  enabled,
  currentUser,
}: UseQuotationCollaborationOptions): UseQuotationCollaborationResult {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<PresencePayload[]>([])
  const [activeSection, setActiveSectionState] = useState<CotizacionCollabSection | null>(null)
  const [activity, setActivity] = useState<CotizacionCollabActivityEvent[]>([])
  const activeSectionRef = useRef<CotizacionCollabSection | null>(null)
  const presenceKeyRef = useRef('')

  const identity = useMemo(() => {
    const userId = currentUser?.id || currentUser?.email || 'anon'
    const email = currentUser?.email || ''
    const name = currentUser?.name || currentUser?.email || 'Usuario'
    return { userId, email, name }
  }, [currentUser?.email, currentUser?.id, currentUser?.name])

  const addActivity = useCallback((event: Partial<CotizacionCollabActivityEvent>) => {
    const normalized = normalizeEvent(event)
    setActivity(prev => [normalized, ...prev].slice(0, MAX_ACTIVITY_EVENTS))
  }, [])

  const logEvent = useCallback(async (
    eventType: CotizacionCollabActivityEvent['event_type'],
    section: CotizacionCollabSection | null,
    metadata?: Record<string, unknown>
  ) => {
    if (!enabled) return
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/collaboration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: eventType,
          section,
          metadata,
        }),
        keepalive: true,
      })

      if (!res.ok) return
      const saved = await res.json()
      addActivity(saved)
    } catch {
      // non-blocking
    }
  }, [addActivity, cotizacionId, enabled])

  const syncPresenceSection = useCallback((section: CotizacionCollabSection | null) => {
    const channel = channelRef.current
    if (!channel) return

    channel.track({
      user_id: identity.userId,
      email: identity.email,
      name: identity.name,
      active_section: section,
      online_at: new Date().toISOString(),
    }).catch(() => null)
  }, [identity.email, identity.name, identity.userId])

  const setActiveSection = useCallback((section: CotizacionCollabSection | null) => {
    setActiveSectionState(prev => {
      if (prev === section) return prev
      activeSectionRef.current = section

      const channel = channelRef.current
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'section_edit',
          payload: {
            user_id: identity.userId,
            user_name: identity.name,
            section,
            previous_section: prev,
            ts: new Date().toISOString(),
          },
        }).catch(() => null)
      }

      syncPresenceSection(section)

      if (prev) {
        void logEvent('stop_edit_section', prev)
      }
      if (section) {
        void logEvent('start_edit_section', section)
      }

      return section
    })
  }, [identity.name, identity.userId, logEvent, syncPresenceSection])

  useEffect(() => {
    if (!enabled) return

    let isMounted = true
    fetch(`/api/cotizaciones/${cotizacionId}/collaboration?limit=25`)
      .then(async res => {
        if (!res.ok || !isMounted) return
        const json = await res.json()
        if (!Array.isArray(json)) return
        setActivity(json.map(normalizeEvent))
      })
      .catch(() => null)

    return () => {
      isMounted = false
    }
  }, [cotizacionId, enabled])

  useEffect(() => {
    if (!enabled) return

    const random = Math.random().toString(36).slice(2, 8)
    presenceKeyRef.current = `${identity.userId}-${random}`

    const channel = supabase.channel(`cotizacion:${cotizacionId}`, {
      config: { presence: { key: presenceKeyRef.current } },
    })

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresencePayload>()
      const users = Object.values(state)
        .flatMap(items => items)
        .filter(Boolean)

      setOnlineUsers(users)
    })

    channel.subscribe(async status => {
      if (status !== 'SUBSCRIBED') return
      await channel.track({
        user_id: identity.userId,
        email: identity.email,
        name: identity.name,
        active_section: activeSectionRef.current,
        online_at: new Date().toISOString(),
      })
      void logEvent('join', activeSectionRef.current, { via: 'realtime' })
    })

    channelRef.current = channel

    const beforeUnload = () => {
      void logEvent('leave', activeSectionRef.current, { via: 'beforeunload' })
      channel.untrack().catch(() => null)
    }

    window.addEventListener('beforeunload', beforeUnload)

    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      void logEvent('leave', activeSectionRef.current, { via: 'cleanup' })
      channel.untrack().catch(() => null)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [cotizacionId, enabled, identity.email, identity.name, identity.userId, logEvent])

  const sectionEditors = useMemo(() => {
    const acc: Partial<Record<CotizacionCollabSection, PresencePayload>> = {}
    onlineUsers.forEach(user => {
      if (!user.active_section) return
      if (user.user_id === identity.userId) return
      if (!acc[user.active_section]) {
        acc[user.active_section] = user
      }
    })
    return acc
  }, [identity.userId, onlineUsers])

  const reportSave = useCallback(async () => {
    await logEvent('save', activeSection)
  }, [activeSection, logEvent])

  return {
    onlineUsers,
    sectionEditors,
    activeSection,
    setActiveSection,
    activity,
    reportSave,
  }
}
