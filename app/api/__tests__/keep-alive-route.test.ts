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
  auditoriaMock: vi.fn(),
  operationsLtMock: vi.fn(),
  operationsDeleteMock: vi.fn(),
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
      if (table === 'bulk_import_operations') {
        return { delete: (...args: unknown[]) => mocks.operationsDeleteMock(table, ...args) }
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

import { GET } from '../keep-alive/route'

const AUDITORIA_OK = {
  ejecutado_en: '2026-10-02T08:00:00Z',
  total_violaciones: 0,
  guardas: [{ clave: 'folio_cp', descripcion: 'folio de cuenta por pagar nulo o duplicado', violaciones: 0, ejemplos: [] }],
}

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
    mocks.auditoriaMock.mockReset().mockResolvedValue({ data: AUDITORIA_OK, error: null })
    mocks.rpcMock.mockReset().mockImplementation(async (fn: string) => {
      if (fn === 'cuentas_anios') return { data: [2026, 2025], error: null }
      if (fn === 'archivar_cuentas_historicas') return { data: { archivados: 2 }, error: null }
      return mocks.auditoriaMock()
    })
    mocks.operationsLtMock.mockReset().mockResolvedValue({ error: null, count: 0 })
    mocks.operationsDeleteMock.mockReset().mockReturnValue({ lt: mocks.operationsLtMock })
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

  it('D15 -- ya no llama la RPC de estados vencidos (el estado del cobro es derivado)', async () => {
    const body = await (await GET(buildRequest('Bearer secreto-real'))).json()

    expect(mocks.rpcMock).not.toHaveBeenCalledWith('sync_estados_cuentas_cobrar_vencidas')
    expect(body).not.toHaveProperty('cuentas_cobrar_sync')
  })

  it('B7 -- corre auditar_consistencia y la deja en la respuesta', async () => {
    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(mocks.rpcMock).toHaveBeenCalledWith('auditar_consistencia')
    expect(response.status).toBe(200)
    expect((await response.json()).auditoria).toEqual({ ok: true, total_violaciones: 0 })
  })

  it('B7 -- una violación se registra y se reporta, pero no marca el keep-alive como fallido', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.auditoriaMock.mockResolvedValue({
      data: { ...AUDITORIA_OK, total_violaciones: 2, guardas: [{ clave: 'cp_sin_grupo', descripcion: 'x', violaciones: 2, ejemplos: ['a'] }] },
      error: null,
    })

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
    expect((await response.json()).auditoria).toEqual({ ok: false, total_violaciones: 2 })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cp_sin_grupo=2'))
    errorSpy.mockRestore()
  })

  it('B7 -- si la auditoría falla, el keep-alive sigue y lo dice sin fingir que todo está en orden', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.auditoriaMock.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const response = await GET(buildRequest('Bearer secreto-real'))

    expect(response.status).toBe(200)
    expect((await response.json()).auditoria).toEqual({ ok: false, total_violaciones: null })
    errorSpy.mockRestore()
  })

  it('PLAN B3 (K2) -- borra bulk_import_operations de más de 30 días (pago_operations se retiró en #123)', async () => {
    mocks.operationsLtMock.mockResolvedValue({ error: null, count: 4 })

    const body = await (await GET(buildRequest('Bearer secreto-real'))).json()

    expect(mocks.operationsDeleteMock).not.toHaveBeenCalledWith('pago_operations', expect.anything())
    expect(mocks.operationsDeleteMock).toHaveBeenCalledWith('bulk_import_operations', { count: 'exact' })
    const [columna, corte] = mocks.operationsLtMock.mock.calls[0]
    expect(columna).toBe('created_at')
    const dias = (Date.now() - new Date(corte as string).getTime()) / (24 * 60 * 60 * 1000)
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThan(30.1)
    expect(body).not.toHaveProperty('pago_operations_deleted')
    expect(body.bulk_import_operations_deleted).toBe(4)
  })

  it('PLAN B3 (K2) -- un fallo al purgar operaciones no tumba el keep-alive', async () => {
    mocks.operationsLtMock.mockResolvedValueOnce({ error: { message: 'boom' }, count: null })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.bulk_import_operations_deleted).toBeNull()
  })

  it('#110 B2 -- archiva a histórico una vez por año, con la fecha de hoy, y reporta cuántos', async () => {
    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(200)
    const llamadas = mocks.rpcMock.mock.calls.filter(([fn]) => fn === 'archivar_cuentas_historicas')
    expect(llamadas.map(([, args]) => args.p_year)).toEqual([2026, 2025])
    expect(llamadas.every(([, args]) => args.p_dry_run === false && /^\d{4}-\d{2}-\d{2}$/.test(args.p_hoy))).toBe(true)
    expect(body.archivado).toEqual({ ok: true, anios: 2, proyectos: 4, fallos: [] })
  })

  it('#110 B2 -- si el archivado de un año falla, los demás siguen y el keep-alive devuelve 500 al final', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpcMock.mockImplementation(async (fn: string, args?: { p_year?: number }) => {
      if (fn === 'cuentas_anios') return { data: [2026, 2025], error: null }
      if (fn === 'archivar_cuentas_historicas') return args?.p_year === 2026 ? { data: null, error: { message: 'statement timeout' } } : { data: { archivados: 3 }, error: null }
      return mocks.auditoriaMock()
    })

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.archivado.ok).toBe(false)
    expect(body.archivado.proyectos).toBe(3)
    expect(body.archivado.fallos).toEqual(['2026: statement timeout'])
    expect(body.auditoria).toEqual({ ok: true, total_violaciones: 0 })
    expect(body.rate_limits_deleted).toBe(0)
    errorSpy.mockRestore()
  })

  it('#110 B2 -- si no se puede leer la lista de años, lo dice (500) en vez de fingir que archivó', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpcMock.mockImplementation(async (fn: string) => (fn === 'cuentas_anios' ? { data: null, error: { message: 'boom' } } : mocks.auditoriaMock()))

    const response = await GET(buildRequest('Bearer secreto-real'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.archivado.ok).toBe(false)
    expect(mocks.rpcMock).not.toHaveBeenCalledWith('archivar_cuentas_historicas', expect.anything())
    errorSpy.mockRestore()
  })
})
