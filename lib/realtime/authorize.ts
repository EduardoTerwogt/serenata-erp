'use client'

import { supabaseBrowser } from '@/lib/supabase-browser'
import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js'

export interface RealtimeTokenResponse {
  token: string
  expires_in: number
}

export async function fetchRealtimeToken(): Promise<RealtimeTokenResponse> {
  const res = await fetch('/api/realtime/token')
  if (!res.ok) throw new Error(`No se pudo obtener el token de Realtime (status ${res.status})`)
  return res.json()
}

/** Autoriza la sesión de Realtime del browser para unirse a canales privados. */
export async function authorizeRealtime(): Promise<number> {
  const { token, expires_in } = await fetchRealtimeToken()
  await supabaseBrowser.realtime.setAuth(token)
  return expires_in
}

/** Crea un canal PRIVADO -- requiere haber llamado `authorizeRealtime()` antes
 *  de `subscribe()`, o el join lo rechaza la política RLS de
 *  `realtime.messages` (ver db/migrations/20260909_realtime_broadcast_authorization.sql). */
export function createPrivateChannel(
  topic: string,
  config: RealtimeChannelOptions['config'] = {}
): RealtimeChannel {
  return supabaseBrowser.channel(topic, { config: { ...config, private: true } })
}

/**
 * Refresca el JWT de Realtime al 60% de su TTL, antes de que expire y el
 * canal se desconecte -- Supabase no reintenta esto solo. Devuelve una
 * función de cancelación para usar en el cleanup del efecto que la llamó.
 */
export function scheduleTokenRefresh(ttlSeconds: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false

  const tick = async () => {
    try {
      const nextTtl = await authorizeRealtime()
      if (!cancelled) timer = setTimeout(tick, Math.max(nextTtl * 0.6, 5) * 1000)
    } catch (e) {
      console.error('[realtime] No se pudo refrescar el token de autorización', e)
      if (!cancelled) timer = setTimeout(tick, 15_000)
    }
  }

  timer = setTimeout(tick, Math.max(ttlSeconds * 0.6, 5) * 1000)
  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
