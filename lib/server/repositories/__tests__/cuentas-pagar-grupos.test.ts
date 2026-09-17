import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reemplaza cuentas-pagar-eventos-realizados.test.ts: la fuente de
// generar-orden-pago pasó de cuentas_pagar_pendientes_eventos_realizados()
// (ahora sin ningún caller -- docs/PLAN.md, Bloque 3) a
// cuentas_pagar_grupos_facturados_eventos_realizados(), que además
// preserva vía UNION ALL el criterio anterior para cuentas sin grupo_id
// todavía (transición hasta que corra la migración retroactiva del
// Bloque 5). Este test solo blinda que los wrappers llaman la RPC/tabla
// correcta y propagan resultado/error sin transformar -- la lógica SQL en
// sí se verificó en vivo contra serenata-erp-test.
const mocks = vi.hoisted(() => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.select = vi.fn(() => obj)
    obj.eq = vi.fn(() => obj)
    obj.in = vi.fn(() => obj)
    obj.update = vi.fn(() => obj)
    obj.maybeSingle = vi.fn()
    obj.order = vi.fn(() => obj)
    obj.then = undefined
    return obj
  }
  return { rpcMock: vi.fn(), fromMock: vi.fn(), chain }
})

vi.mock('@/lib/server/supabase-admin', () => ({
  supabaseAdmin: { rpc: mocks.rpcMock, from: mocks.fromMock },
}))

import { getCuentasPagarGruposFacturadosEventosRealizados, updateCuentasPagarGruposEnOrden, marcarGrupoFacturado } from '../cuentas-pagar'

describe('getCuentasPagarGruposFacturadosEventosRealizados', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('llama la RPC cuentas_pagar_grupos_facturados_eventos_realizados sin parámetros', async () => {
    mocks.rpcMock.mockResolvedValue({ data: [], error: null })
    await getCuentasPagarGruposFacturadosEventosRealizados()
    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_pagar_grupos_facturados_eventos_realizados')
  })

  it('devuelve el shape tal cual lo entrega la RPC, sin transformar', async () => {
    const fila = { id: 'cp-1', grupo_id: 'grupo-1', cotizacion_id: 'SH003', cotizaciones: { proyecto: 'X', fecha_entrega: '2026-05-30' } }
    mocks.rpcMock.mockResolvedValue({ data: [fila], error: null })
    const result = await getCuentasPagarGruposFacturadosEventosRealizados()
    expect(result).toEqual([fila])
  })

  it('propaga el error de Supabase sin transformarlo', async () => {
    const dbError = new Error('conexión perdida')
    mocks.rpcMock.mockResolvedValue({ data: null, error: dbError })
    await expect(getCuentasPagarGruposFacturadosEventosRealizados()).rejects.toBe(dbError)
  })
})

describe('updateCuentasPagarGruposEnOrden', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('actualiza cuentas_pagar_grupos y cuentas_pagar (hijas) con el mismo orden_pago_id', async () => {
    const gruposChain = mocks.chain()
    gruposChain.in = vi.fn().mockResolvedValue({ error: null })
    const cuentasChain = mocks.chain()
    cuentasChain.in = vi.fn().mockResolvedValue({ error: null })

    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'cuentas_pagar_grupos') return gruposChain
      if (table === 'cuentas_pagar') return cuentasChain
      throw new Error(`tabla inesperada: ${table}`)
    })

    await updateCuentasPagarGruposEnOrden(['grupo-a', 'grupo-b'], 'orden-1')

    expect(gruposChain.update).toHaveBeenCalledWith({ estado: 'EN_PROCESO_PAGO', orden_pago_id: 'orden-1' })
    expect(gruposChain.in).toHaveBeenCalledWith('id', ['grupo-a', 'grupo-b'])
    expect(cuentasChain.update).toHaveBeenCalledWith({ estado: 'EN_PROCESO_PAGO', orden_pago_id: 'orden-1' })
    expect(cuentasChain.in).toHaveBeenCalledWith('grupo_id', ['grupo-a', 'grupo-b'])
  })
})

describe('marcarGrupoFacturado', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('actualiza estado=FACTURADO con guard estado=ABIERTO, y devuelve la fila si aplicó', async () => {
    const grupoChain = mocks.chain()
    grupoChain.eq = vi.fn(() => grupoChain)
    grupoChain.select = vi.fn().mockResolvedValue({ data: [{ id: 'grupo-1', estado: 'FACTURADO' }], error: null })
    mocks.fromMock.mockReturnValue(grupoChain)

    const result = await marcarGrupoFacturado('grupo-1')

    expect(grupoChain.update).toHaveBeenCalledWith(expect.objectContaining({ estado: 'FACTURADO' }))
    expect(result).toEqual({ id: 'grupo-1', estado: 'FACTURADO' })
  })

  it('devuelve null si el guard no encontró una fila ABIERTO (ya facturado o carrera)', async () => {
    const grupoChain = mocks.chain()
    grupoChain.eq = vi.fn(() => grupoChain)
    grupoChain.select = vi.fn().mockResolvedValue({ data: [], error: null })
    mocks.fromMock.mockReturnValue(grupoChain)

    const result = await marcarGrupoFacturado('grupo-1')
    expect(result).toBeNull()
  })
})
