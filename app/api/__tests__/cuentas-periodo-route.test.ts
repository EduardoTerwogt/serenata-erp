import { beforeEach, describe, expect, it, vi } from 'vitest'

// Rediseño de Cuentas B3 (docs/PLAN.md): GET /api/cuentas/periodo y /resumen.
const mocks = vi.hoisted(() => ({
  requireSectionMock: vi.fn(async () => ({ response: null as Response | null })),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({ requireSection: mocks.requireSectionMock }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))
vi.mock('@/lib/shared/hoy-cdmx', () => ({ hoyCdmx: () => '2026-09-24' }))

import { GET as getPeriodo } from '../cuentas/periodo/route'
import { GET as getResumen } from '../cuentas/resumen/route'

const anio2026 = {
  proyectos: [['SH061', 'Aurora', 'Modelo', null, '2026-09-18', 0, 0, 0, 0]],
  cobros: [['cc-1', 'SH061', 'SH061', 'CC-1', 'Modelo', null, 'Aurora', 1000, 0, '2026-09-10', null, null, null]],
  pagos: [],
  grupos: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSectionMock.mockResolvedValue({ response: null })
  mocks.rpcMock.mockImplementation(async (fn: string) => {
    if (fn === 'cuentas_anios') return { data: [2026], error: null }
    if (fn === 'cuentas_por_proyecto') return { data: anio2026, error: null }
    throw new Error(`RPC inesperada: ${fn}`)
  })
})

describe('GET /api/cuentas/periodo', () => {
  it('sin sesión de Cuentas no consulta nada', async () => {
    mocks.requireSectionMock.mockResolvedValue({ response: Response.json({ error: 'No autorizado' }, { status: 403 }) })
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo'))
    expect(res.status).toBe(403)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('parámetros inválidos -- 400 sin consultar', async () => {
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo?mes=13'))
    expect(res.status).toBe(400)
    expect(mocks.rpcMock).not.toHaveBeenCalled()
  })

  it('sin año ni mes toma el año y mes actuales (CDMX) y pide solo ese año', async () => {
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo?cliente=&q='))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ anio: 2026, mes: 9, hoy: '2026-09-24' })
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_por_proyecto', { p_year: 2026 })
    expect(body.proyectos.items[0]).toMatchObject({ id: 'SH061', cuentas: { cerradas: false, hay_vencidos: true } })
  })

  it('un año pasado sin mes abre "Todo el año"', async () => {
    const body = await (await getPeriodo(new Request('http://x/api/cuentas/periodo?anio=2025'))).json()
    expect(body.mes).toBe('todo')
  })

  it('error de la RPC -- 500 sin exponer el mensaje', async () => {
    mocks.rpcMock.mockResolvedValue({ data: null, error: { message: 'relation boom' } })
    const res = await getPeriodo(new Request('http://x/api/cuentas/periodo'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('boom')
  })
})

describe('GET /api/cuentas/resumen', () => {
  it('años con pendientes y contador de avisos', async () => {
    const res = await getResumen()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hoy: '2026-09-24', anios: [{ anio: 2026, pendientes: 1 }], avisos: 2 })
  })
})
