import { describe, expect, it } from 'vitest'
import { RealtimeClient } from '@supabase/realtime-js'
import PresenceAdapter from '@supabase/realtime-js/dist/main/phoenix/presenceAdapter'

/**
 * Guardas de la versión FIJADA de `@supabase/realtime-js` (`overrides` en
 * package.json, docs/decisions/016). Corren contra el código real instalado,
 * sin mocks: si alguien sube o baja la versión, estos tests dicen si la nueva
 * rompe algo de lo que la colaboración en vivo depende.
 *
 * Tocan internos a propósito (el adaptador de Presence, `_setAuthSafely`):
 * son exactamente los puntos que cambiaron entre versiones. Si un upgrade
 * mueve esos internos, que este archivo falle es la señal correcta -- hay
 * que re-verificar el comportamiento antes de aceptar la versión nueva.
 */

type PhoenixHandler = (payload: unknown) => void

function createAdapter() {
  const handlers: Record<string, PhoenixHandler[]> = {}
  const phoenixChannel = {
    on: (event: string, cb: PhoenixHandler) => { (handlers[event] ||= []).push(cb) },
    trigger: () => undefined,
    joinRef: () => '1',
  }
  const adapter = new PresenceAdapter({ getChannel: () => phoenixChannel } as never)
  const emit = (event: string, payload: unknown) => (handlers[event] || []).forEach((cb) => cb(payload))
  return { adapter, emit }
}

const meta = (ref: string, activeSection: string | null) => ({ phx_ref: ref, user_id: 'A', active_section: activeSection })

describe('@supabase/realtime-js (versión fijada) -- Presence', () => {
  // Bug de 2.100.0 (el que dejaba "X está editando" pegado): el adaptador borraba
  // `phx_ref` de los registros YA guardados al avisar a los listeners, así que las
  // bajas del servidor (que se buscan por `phx_ref`) nunca encontraban qué quitar.
  it('un cambio de sección (alta nueva + baja de la anterior en el mismo diff) no deja registros viejos', () => {
    const { adapter, emit } = createAdapter()
    emit('presence_state', { A: { metas: [meta('r1', null)] } })
    emit('presence_diff', { joins: { A: { metas: [meta('r2', 'partidas')] } }, leaves: { A: { metas: [meta('r1', null)] } } })
    emit('presence_diff', { joins: { A: { metas: [meta('r3', null)] } }, leaves: { A: { metas: [meta('r2', 'partidas')] } } })

    const metas = adapter.state.A as unknown as Array<{ active_section: string | null }>
    expect(metas).toHaveLength(1)
    expect(metas[0].active_section).toBeNull()
  })

  it('salir del canal (baja sin alta) borra al usuario por completo', () => {
    const { adapter, emit } = createAdapter()
    emit('presence_state', { A: { metas: [meta('r1', null)] } })
    emit('presence_diff', { joins: { A: { metas: [meta('r2', 'general')] } }, leaves: { A: { metas: [meta('r1', null)] } } })
    emit('presence_diff', { joins: {}, leaves: { A: { metas: [meta('r2', 'general')] } } })

    expect(adapter.state).toEqual({})
  })
})

describe('@supabase/realtime-js (versión fijada) -- token propio de Realtime', () => {
  // Desde 2.113.0, si el cliente tiene callback `accessToken` (supabase-js SIEMPRE
  // lo configura; sin sesión de Supabase Auth devuelve la anon key), el callback
  // manda sobre `setAuth(token)` y en cada heartbeat reemplaza nuestro JWT propio
  // (lib/realtime/authorize.ts) por la anon key -- el canal privado dejaría de
  // estar autorizado. Subir exige primero pasar `accessToken` en `createClient`.
  it('el JWT puesto con setAuth(token) sobrevive al refresco de auth del heartbeat', async () => {
    const client = new RealtimeClient('wss://example.invalid/realtime/v1', {
      params: { apikey: 'ANON' },
      accessToken: async () => 'ANON',
    })
    await client.setAuth('JWT_PROPIO')
    ;(client as unknown as { _setAuthSafely: (context: string) => void })._setAuthSafely('heartbeat')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(client.accessTokenValue).toBe('JWT_PROPIO')
  })
})
