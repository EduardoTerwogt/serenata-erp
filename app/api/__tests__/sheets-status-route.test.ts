import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnySectionMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireAnySection: mocks.requireAnySectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.fromMock } }))

import { GET } from '../integrations/sheets/status/route'

function chainableSingle(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(result),
  }
  return builder
}

// EF-3 3C-3: GET /status nunca es público -- misma auth que POST
// /sync-down. error_message ya viene sanitizado desde el propio
// release_sheets_sync_lock (nunca el detalle técnico crudo), así que esta
// ruta lo devuelve tal cual sin reprocesarlo.
describe('GET /api/integrations/sheets/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requiere sesión -- responde 401/403 sin sesión', async () => {
    const denyResponse = Response.json({ error: 'no autorizado' }, { status: 401 })
    mocks.requireAnySectionMock.mockResolvedValueOnce({ response: denyResponse })

    const res = await GET()

    expect([401, 403]).toContain(res.status)
    expect(mocks.fromMock).not.toHaveBeenCalled()
  })

  it('con sesión, devuelve el estado tal cual viene de sheets_sync_status', async () => {
    mocks.requireAnySectionMock.mockResolvedValueOnce({ response: null })
    const row = {
      state: 'idle', run_id: null, started_at: null, finished_at: '2026-09-14T00:00:00Z',
      triggered_by: 'manual:admin', rows_synced: 120, tables_failed: 0, error_message: null,
    }
    mocks.fromMock.mockReturnValue(chainableSingle({ data: row, error: null }))

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(row)
  })

  it('responde 500 sin exponer el error interno si la consulta falla', async () => {
    mocks.requireAnySectionMock.mockResolvedValueOnce({ response: null })
    mocks.fromMock.mockReturnValue(chainableSingle({ data: null, error: new Error('conexión perdida') }))

    const res = await GET()

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('conexión perdida')
  })
})
