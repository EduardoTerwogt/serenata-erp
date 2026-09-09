import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendRealtimeBroadcast } from '../broadcast'

describe('sendRealtimeBroadcast', () => {
  const originalFetch = global.fetch
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  })

  it('llama al endpoint REST de broadcast con la URL, headers y body exactos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as unknown as typeof fetch

    await sendRealtimeBroadcast([
      { topic: 'cotizacion:SH001', event: 'item_confirmed', payload: { cotizacion_id: 'SH001' } },
    ])

    expect(fetchMock).toHaveBeenCalledWith('https://proyecto.supabase.co/realtime/v1/api/broadcast', {
      method: 'POST',
      headers: {
        apikey: 'service-role-key',
        Authorization: 'Bearer service-role-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic: 'cotizacion:SH001', event: 'item_confirmed', payload: { cotizacion_id: 'SH001' } }],
      }),
    })
  })

  it('nunca lanza si fetch rechaza (fire-and-forget)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('red caída')) as unknown as typeof fetch
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(sendRealtimeBroadcast([{ topic: 't', event: 'e', payload: {} }])).resolves.toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('nunca lanza si la respuesta no es ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(sendRealtimeBroadcast([{ topic: 't', event: 'e', payload: {} }])).resolves.toBeUndefined()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('no llama a fetch si faltan las env vars de Supabase', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    await sendRealtimeBroadcast([{ topic: 't', event: 'e', payload: {} }])

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
