export interface RealtimeBroadcastMessage {
  topic: string
  event: string
  payload: Record<string, unknown>
}

/**
 * Envía uno o más mensajes de Broadcast vía el endpoint REST de Supabase --
 * nunca abrir un WebSocket desde una API route serverless, es lento y no es
 * el patrón recomendado en Vercel. Fire-and-forget desde la perspectiva del
 * caller: nunca lanza, solo loguea -- un fallo de Realtime no puede tumbar
 * un PATCH que ya comprometió datos en Postgres.
 */
export async function sendRealtimeBroadcast(messages: RealtimeBroadcastMessage[]): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    })
    if (!res.ok) {
      console.error('[realtime broadcast] status', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    console.error('[realtime broadcast] fetch failed', e)
  }
}
