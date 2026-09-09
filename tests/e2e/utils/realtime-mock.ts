import { Page } from '@playwright/test'

/**
 * Emula el canal de Supabase Realtime (protocolo Phoenix, formato array de vsn=2.0.0:
 * `[join_ref, ref, topic, event, payload]`) para poder inyectar en las pruebas las
 * señales que envía OTRO colaborador, sin necesidad de un segundo navegador.
 */
export interface RealtimeMock {
  /**
   * Envía una señal como si viniera de otro usuario. Espera a que el canal se haya
   * unido: en CI el enlace tarda más que en local y emitir antes se perdía.
   */
  emit: (event: string, payload: Record<string, unknown>) => Promise<void>
  /** Espera a que el canal esté unido. */
  esperarConexion: (timeoutMs?: number) => Promise<void>
  conectado: () => boolean
}

const OTRO = { user_id: 'otro-colaborador', email: 'otro@serenata.test', name: 'Otro' }

export async function mockRealtimeChannel(page: Page): Promise<RealtimeMock> {
  let ws: { send: (data: string) => void } | null = null
  let topic: string | null = null
  let joinRef: string | null = null

  await page.routeWebSocket(/realtime/, (route) => {
    ws = route
    route.onMessage((raw) => {
      let msg: unknown
      try { msg = JSON.parse(raw.toString()) } catch { return }
      const arr = Array.isArray(msg)
      const [jr, ref, t, event] = arr
        ? (msg as [string, string, string, string])
        : [(msg as Record<string, string>).join_ref, (msg as Record<string, string>).ref, (msg as Record<string, string>).topic, (msg as Record<string, string>).event]
      const reply = (payload: unknown) => route.send(JSON.stringify(
        arr ? [jr, ref, t, 'phx_reply', payload] : { join_ref: jr, ref, topic: t, event: 'phx_reply', payload }
      ))
      if (event === 'phx_join') {
        topic = t
        joinRef = jr
        reply({ status: 'ok', response: {} })
        // Presencia con el otro colaborador dentro: el aviso de "quién edita" se
        // calcula a partir de la presencia, no solo de la señal de sección.
        const presencia = { 'otro-colaborador': { metas: [{ ...OTRO, active_section: null, online_at: new Date().toISOString(), phx_ref: 'ref-otro' }] } }
        route.send(JSON.stringify(arr ? [jr, null, t, 'presence_state', presencia] : { topic: t, event: 'presence_state', payload: presencia }))
        return
      }
      if (event === 'heartbeat' || event === 'access_token' || event === 'presence') {
        reply({ status: 'ok', response: {} })
      }
    })
  })

  const esperarConexion = async (timeoutMs = 15_000) => {
    const limite = Date.now() + timeoutMs
    while (!ws || !topic) {
      if (Date.now() > limite) throw new Error('El canal simulado no llegó a conectarse')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  return {
    conectado: () => !!ws && !!topic,
    esperarConexion,
    emit: async (event, payload) => {
      await esperarConexion()
      ws!.send(JSON.stringify([joinRef, null, topic, 'broadcast', {
        event,
        type: 'broadcast',
        payload: { user_id: 'otro-colaborador', email: 'otro@serenata.test', name: 'Otro', at: new Date().toISOString(), ...payload },
      }]))
    },
  }
}
