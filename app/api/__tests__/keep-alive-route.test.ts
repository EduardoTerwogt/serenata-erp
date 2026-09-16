import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkDriveAuthMock: vi.fn(),
  limitMock: vi.fn(),
  deleteMock: vi.fn(),
  notMock: vi.fn(),
  ltMock: vi.fn(),
  rateLimitsDeleteMock: vi.fn(),
  rateLimitsLtMock: vi.fn(),
  rpcMock: vi.fn(),
  getGoogleEnvMock: vi.fn(),
  syncAllDownMock: vi.fn(),
}))

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'idempotency_keys') {
        return { delete: mocks.deleteMock }
      }
      if (table === 'rate_limits') {
        return { delete: mocks.rateLimitsDeleteMock }
      }
      return {
        select: () => ({
          limit: mocks.limitMock,
        }),
      }
    },
    rpc: mocks.rpcMock,
  },
}))

vi.mock('@/lib/integrations/google/drive', () => ({
  checkDriveAuth: mocks.checkDriveAuthMock,
}))

vi.mock('@/lib/integrations/google/env', () => ({ getGoogleEnv: mocks.getGoogleEnvMock }))

// Reexporta la clase real SheetsSyncLeaseLostError (no un mock) -- así el
// `instanceof` de la ruta funciona exactamente igual que en producción,
// mismo patrón que app/api/__tests__/sheets-sync-down-route.test.ts.
vi.mock('@/lib/integrations/sheets/sync-down', async () => {
  const actual = await vi.importActual<typeof import('@/lib/integrations/sheets/sync-down')>('@/lib/integrations/sheets/sync-down')
  return {
    syncAllDown: mocks.syncAllDownMock,
    SheetsSyncLeaseLostError: actual.SheetsSyncLeaseLostError,
  }
})

import { GET } from '../keep-alive/route'
import { SheetsSyncLeaseLostError } from '@/lib/integrations/sheets/sync-down'

function buildRequest(authHeader: string | null) {
  const headers = new Headers()
  if (authHeader !== null) headers.set('authorization', authHeader)
  return new Request('http://localhost/api/keep-alive', { headers })
}

describe('GET /api/keep-alive', () => {
  const originalCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    mocks.limitMock.mockReset().mockResolvedValue({ error: null })
    mocks.checkDriveAuthMock.mockReset().mockResolvedValue({ status: 'ok' })
    mocks.ltMock.mockReset().mockResolvedValue({ error: null, count: 0 })
    mocks.notMock.mockReset().mockReturnValue({ lt: mocks.ltMock })
    mocks.deleteMock.mockReset().mockReturnValue({ not: mocks.notMock })
    mocks.rateLimitsLtMock.mockReset().mockResolvedValue({ error: null, count: 0 })
    mocks.rateLimitsDeleteMock.mockReset().mockReturnValue({ lt: mocks.rateLimitsLtMock })
    mocks.rpcMock.mockReset()
    // Google/Sheets no configurado por default -- el safety-net se salta sin tocar el RPC.
    mocks.getGoogleEnvMock.mockReset().mockReturnValue(null)
    mocks.syncAllDownMock.mockReset()
    process.env.CRON_SECRET = 'secreto-real'
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret
  })

  it('1B-3 -- falla cerrado (500) si CRON_SECRET no está configurado, nunca deja pasar con "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET
    const response = await GET(buildRequest('Bearer undefined'))
    expect(response.status).toBe(500)
    expect(mocks.limitMock).not.toHaveBeenCalled()
  })

  it('retorna 401 si el header no coincide con CRON_SECRET configurado', async () => {
    const response = await GET(buildRequest('Bearer otro-valor'))
    expect(response.status).toBe(401)
  })

  it('retorna 200 con el header correcto y CRON_SECRET configurado', async () => {
    const response = await GET(buildRequest('Bearer secreto-real'))
    expect(response.status).toBe(200)
  })

  it('1E-1 -- borra idempotency_keys solo completadas (status_code no NULL) con más de 7 días', async () => {
    mocks.ltMock.mockResolvedValue({ error: null, count: 3 })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(mocks.deleteMock).toHaveBeenCalledWith({ count: 'exact' })
    expect(mocks.notMock).toHaveBeenCalledWith('status_code', 'is', null)
    expect(mocks.ltMock).toHaveBeenCalledTimes(1)
    expect(body.idempotency_keys_deleted).toBe(3)
  })

  it('1E-1 -- un fallo en la limpieza de idempotency_keys no tumba el keep-alive', async () => {
    mocks.ltMock.mockResolvedValue({ error: { message: 'boom' }, count: null })

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
  })

  it('EF-3 3C-4 -- borra solo rate_limits con window_start de más de 24h', async () => {
    mocks.rateLimitsLtMock.mockResolvedValue({ error: null, count: 5 })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(mocks.rateLimitsDeleteMock).toHaveBeenCalledWith({ count: 'exact' })
    expect(mocks.rateLimitsLtMock).toHaveBeenCalledTimes(1)
    expect(body.rate_limits_deleted).toBe(5)
  })

  it('EF-3 3C-4 -- un fallo en la limpieza de rate_limits no tumba el keep-alive', async () => {
    mocks.rateLimitsLtMock.mockResolvedValue({ error: { message: 'boom' }, count: null })

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
  })

  it('EF-3 3C-4 -- el safety-net de Sheets se salta si Google/Sheets no está configurado', async () => {
    mocks.getGoogleEnvMock.mockReturnValue(null)

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(mocks.rpcMock).not.toHaveBeenCalled()
    expect(mocks.syncAllDownMock).not.toHaveBeenCalled()
    expect(body.sheets_sync).toEqual({ ran: false })
  })

  it('EF-3 3C-4 -- el safety-net se salta en silencio si no adquiere el lock (sync manual en curso)', async () => {
    mocks.getGoogleEnvMock.mockReturnValue({ sheetsSpreadsheetId: 'sheet-1' })
    mocks.rpcMock.mockImplementation((fnName: string) => {
      if (fnName === 'acquire_sheets_sync_lock') return Promise.resolve({ data: false, error: null })
      throw new Error(`RPC inesperada: ${fnName}`)
    })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.syncAllDownMock).not.toHaveBeenCalled()
    expect(body.sheets_sync).toEqual({ ran: false })
  })

  it('EF-3 3C-4 -- adquiere el lock, corre syncAllDown y libera con éxito', async () => {
    mocks.getGoogleEnvMock.mockReturnValue({ sheetsSpreadsheetId: 'sheet-1' })
    mocks.rpcMock.mockImplementation((fnName: string, params: Record<string, unknown>) => {
      if (fnName === 'acquire_sheets_sync_lock') {
        expect(params.p_triggered_by).toBe('cron:keep-alive')
        return Promise.resolve({ data: true, error: null })
      }
      if (fnName === 'release_sheets_sync_lock') {
        expect(params.p_state).toBe('idle')
        expect(params.p_rows_synced).toBe(42)
        expect(params.p_tables_failed).toBe(0)
        return Promise.resolve({ data: true, error: null })
      }
      throw new Error(`RPC inesperada: ${fnName}`)
    })
    mocks.syncAllDownMock.mockResolvedValue({
      spreadsheetId: 'sheet-1',
      results: [{ tab: 'cotizaciones', table: 'cotizaciones', rows: 42, ok: true }],
      totalRows: 42,
      errors: 0,
    })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.syncAllDownMock).toHaveBeenCalledWith('sheet-1', expect.any(Function))
    expect(body.sheets_sync).toEqual({ ran: true, rows: 42, errors: 0 })
  })

  it('EF-3 3C-4 -- libera con estado error si alguna tabla falla, sin tumbar el keep-alive', async () => {
    mocks.getGoogleEnvMock.mockReturnValue({ sheetsSpreadsheetId: 'sheet-1' })
    mocks.rpcMock.mockImplementation((fnName: string, params: Record<string, unknown>) => {
      if (fnName === 'acquire_sheets_sync_lock') return Promise.resolve({ data: true, error: null })
      if (fnName === 'release_sheets_sync_lock') {
        expect(params.p_state).toBe('error')
        expect(params.p_tables_failed).toBe(1)
        return Promise.resolve({ data: true, error: null })
      }
      throw new Error(`RPC inesperada: ${fnName}`)
    })
    mocks.syncAllDownMock.mockResolvedValue({
      spreadsheetId: 'sheet-1',
      results: [{ tab: 'cotizaciones', table: 'cotizaciones', rows: 0, ok: false, error: 'boom' }],
      totalRows: 0,
      errors: 1,
    })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.sheets_sync).toEqual({ ran: true, rows: 0, errors: 1 })
  })

  it('EF-3 3C-4 -- lease perdido a medio camino no llama release y no tumba el keep-alive', async () => {
    mocks.getGoogleEnvMock.mockReturnValue({ sheetsSpreadsheetId: 'sheet-1' })
    mocks.rpcMock.mockImplementation((fnName: string) => {
      if (fnName === 'acquire_sheets_sync_lock') return Promise.resolve({ data: true, error: null })
      if (fnName === 'release_sheets_sync_lock') throw new Error('release_sheets_sync_lock no debe llamarse tras un lease perdido')
      throw new Error(`RPC inesperada: ${fnName}`)
    })
    mocks.syncAllDownMock.mockRejectedValue(new SheetsSyncLeaseLostError('perdido'))

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.sheets_sync).toEqual({ ran: false })
  })

  it('EF-3 3C-4 -- un fallo real del safety-net (no lease perdido) se loguea pero no tumba el keep-alive', async () => {
    mocks.getGoogleEnvMock.mockReturnValue({ sheetsSpreadsheetId: 'sheet-1' })
    mocks.rpcMock.mockImplementation((fnName: string) => {
      if (fnName === 'acquire_sheets_sync_lock') return Promise.resolve({ data: true, error: null })
      throw new Error(`RPC inesperada: ${fnName}`)
    })
    mocks.syncAllDownMock.mockRejectedValue(new Error('Sheets API caída'))

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
  })
})
