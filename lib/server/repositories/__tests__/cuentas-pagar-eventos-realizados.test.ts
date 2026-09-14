import { beforeEach, describe, expect, it, vi } from 'vitest'

// EF-3 3B-8: getCuentasPagarPendientesEventosRealizados() delega el filtro
// fecha_entrega<=hoy a la RPC cuentas_pagar_pendientes_eventos_realizados
// (db/migrations/20260914_cuentas_pagar_pendientes_eventos_realizados.sql)
// -- ya no trae todas las PENDIENTE ni filtra en JS. La paridad de
// resultados (conteo, ids, shape anidado cotizaciones/proyectos) contra el
// filtro JS anterior se verificó en vivo contra serenata-erp-test,
// documentada en el PR -- este test solo blinda que el wrapper llama la
// RPC correcta y propaga resultado/error sin transformar.
const mocks = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { getCuentasPagarPendientesEventosRealizados } from '../cuentas-pagar'

describe('getCuentasPagarPendientesEventosRealizados', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('llama la RPC cuentas_pagar_pendientes_eventos_realizados sin parámetros', async () => {
    mocks.rpcMock.mockResolvedValue({ data: [], error: null })

    await getCuentasPagarPendientesEventosRealizados()

    expect(mocks.rpcMock).toHaveBeenCalledWith('cuentas_pagar_pendientes_eventos_realizados')
  })

  it('devuelve el shape anidado tal cual lo entrega la RPC, sin transformar', async () => {
    const fila = {
      id: 'cp-1',
      estado: 'PENDIENTE',
      responsable_nombre: 'Diego Torres',
      cotizacion_id: 'SH003',
      cotizaciones: { proyecto: 'Documental Raíces', fecha_entrega: '2026-05-30' },
      proyectos: { proyecto: 'Documental Raíces' },
    }
    mocks.rpcMock.mockResolvedValue({ data: [fila], error: null })

    const result = await getCuentasPagarPendientesEventosRealizados()

    expect(result).toEqual([fila])
  })

  it('propaga el error de Supabase sin transformarlo', async () => {
    const dbError = new Error('conexión perdida')
    mocks.rpcMock.mockResolvedValue({ data: null, error: dbError })

    await expect(getCuentasPagarPendientesEventosRealizados()).rejects.toBe(dbError)
  })
})
