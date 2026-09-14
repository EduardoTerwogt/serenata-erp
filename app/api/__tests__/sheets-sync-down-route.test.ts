import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnySectionMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  syncAllDownMock: vi.fn(),
  syncTableDownByNameMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireAnySection: mocks.requireAnySectionMock }))
vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))
// Reexporta la clase real SheetsSyncLeaseLostError (no un mock) -- así el
// `instanceof` de la ruta funciona exactamente igual que en producción.
vi.mock('@/lib/integrations/sheets/sync-down', async () => {
  const actual = await vi.importActual<typeof import('@/lib/integrations/sheets/sync-down')>('@/lib/integrations/sheets/sync-down')
  return {
    syncAllDown: mocks.syncAllDownMock,
    syncTableDownByName: mocks.syncTableDownByNameMock,
    SheetsSyncLeaseLostError: actual.SheetsSyncLeaseLostError,
  }
})
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { POST } from '../integrations/sheets/sync-down/route'
import { SheetsSyncLeaseLostError } from '@/lib/integrations/sheets/sync-down'

const SPREADSHEET_ID = 'sheet-1'
const GOOGLE_ENV_OK = { sheetsSpreadsheetId: SPREADSHEET_ID }

function req(body?: unknown) {
  return new Request('http://localhost/api/integrations/sheets/sync-down', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// EF-3 3C-3: la ruta ahora está protegida por el lock de sheets_sync_status
// -- adquiere antes de sincronizar, renueva vía heartbeat (probado a nivel
// de sync-down.ts), y libera al terminar con el estado correcto. Un lease
// perdido a medio camino (SheetsSyncLeaseLostError) responde 409 sin llamar
// release -- ya no es dueña del lock. Cualquier otro error no anticipado
// (incluida una falla real de la RPC de renovación entre tablas) responde
// 500 vía buildErrorResponse, nunca 409.
describe('POST /api/integrations/sheets/sync-down', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAnySectionMock.mockResolvedValue({ response: null })
    mocks.getGoogleEnvMock.mockReturnValue(GOOGLE_ENV_OK)
  })

  it('requiere la sección cotizaciones', async () => {
    const denyResponse = Response.json({ error: 'no autorizado' }, { status: 403 })
    mocks.requireAnySectionMock.mockResolvedValueOnce({ response: denyResponse })

    const res = await POST(req())

    expect(res.status).toBe(403)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('responde 503 si Google no está configurado', async () => {
    mocks.getGoogleEnvMock.mockReturnValueOnce(null)

    const res = await POST(req())

    expect(res.status).toBe(503)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('responde 503 si falta GOOGLE_SHEETS_SPREADSHEET_ID', async () => {
    mocks.getGoogleEnvMock.mockReturnValueOnce({ sheetsSpreadsheetId: null })

    const res = await POST(req())

    expect(res.status).toBe(503)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('responde 409 si no consigue el lock (otra sync en curso), sin llamar a sync ni a release', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ data: false, error: null }) // acquire

    const res = await POST(req())

    expect(res.status).toBe(409)
    expect(mocks.syncAllDownMock).not.toHaveBeenCalled()
    expect(mocks.syncTableDownByNameMock).not.toHaveBeenCalled()
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
  })

  it('responde 500 (no 409) si la propia llamada RPC de acquire falla', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout de red' } })

    const res = await POST(req())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('timeout de red')
    expect(mocks.syncAllDownMock).not.toHaveBeenCalled()
  })

  it('éxito: adquiere, sincroniza todas las tablas, libera con state=idle', async () => {
    mocks.rpcMock
      .mockResolvedValueOnce({ data: true, error: null }) // acquire
      .mockResolvedValueOnce({ data: true, error: null }) // release
    mocks.syncAllDownMock.mockResolvedValue({
      spreadsheetId: SPREADSHEET_ID,
      results: [{ tab: 'Cotizaciones', table: 'cotizaciones', rows: 10, ok: true }],
      totalRows: 10,
      errors: 0,
    })

    const res = await POST(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.state).toBe('idle')
    expect(mocks.syncAllDownMock).toHaveBeenCalledWith(SPREADSHEET_ID, expect.any(Function))
    expect(mocks.rpcMock).toHaveBeenCalledTimes(2)
    const releaseCall = mocks.rpcMock.mock.calls[1]
    expect(releaseCall[0]).toBe('release_sheets_sync_lock')
    expect(releaseCall[1]).toMatchObject({ p_state: 'idle', p_rows_synced: 10, p_tables_failed: 0, p_error_message: null })
  })

  it('parcial: si alguna tabla falla, libera con state=error y un resumen seguro (nunca el mensaje técnico crudo)', async () => {
    mocks.rpcMock
      .mockResolvedValueOnce({ data: true, error: null }) // acquire
      .mockResolvedValueOnce({ data: true, error: null }) // release
    mocks.syncAllDownMock.mockResolvedValue({
      spreadsheetId: SPREADSHEET_ID,
      results: [
        { tab: 'Cotizaciones', table: 'cotizaciones', rows: 10, ok: true },
        { tab: 'Proyectos', table: 'proyectos', rows: 0, ok: false, error: 'ECONNRESET at socket.js:42 (detalle técnico crudo de Supabase)' },
      ],
      totalRows: 10,
      errors: 1,
    })

    const res = await POST(req())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.state).toBe('error')
    const releaseCall = mocks.rpcMock.mock.calls[1]
    expect(releaseCall[1].p_state).toBe('error')
    expect(releaseCall[1].p_tables_failed).toBe(1)
    // El resumen seguro solo nombra la tabla que falló -- nunca el mensaje
    // técnico crudo de Supabase.
    expect(releaseCall[1].p_error_message).toContain('Proyectos')
    expect(releaseCall[1].p_error_message).not.toContain('ECONNRESET')
    expect(releaseCall[1].p_error_message).not.toContain('socket.js')
  })

  it('body.tables: sincroniza solo las tablas pedidas vía syncTableDownByName, libera igual que el flujo completo', async () => {
    mocks.rpcMock
      .mockResolvedValueOnce({ data: true, error: null }) // acquire
      .mockResolvedValueOnce({ data: true, error: null }) // release
    mocks.syncTableDownByNameMock.mockResolvedValue({ tab: 'Cotizaciones', table: 'cotizaciones', rows: 5, ok: true })

    const res = await POST(req({ tables: ['cotizaciones'] }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.state).toBe('idle')
    expect(mocks.syncTableDownByNameMock).toHaveBeenCalledWith(SPREADSHEET_ID, 'cotizaciones', expect.any(Function))
    expect(mocks.syncAllDownMock).not.toHaveBeenCalled()
  })

  it('lease perdido a medio camino: responde 409 sin llamar release_sheets_sync_lock', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ data: true, error: null }) // acquire
    mocks.syncAllDownMock.mockRejectedValue(new SheetsSyncLeaseLostError('perdido'))

    const res = await POST(req())

    expect(res.status).toBe(409)
    // Solo la llamada de acquire -- nunca release, ya no es dueña del lock.
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
  })

  it('un fallo real no anticipado (ej. RPC de renovación entre tablas) responde 500, nunca 409, y tampoco llama release', async () => {
    mocks.rpcMock.mockResolvedValueOnce({ data: true, error: null }) // acquire
    mocks.syncAllDownMock.mockRejectedValue(new Error('timeout de renovación'))

    const res = await POST(req())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('timeout de renovación')
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
  })
})
