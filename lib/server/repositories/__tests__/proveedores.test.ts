import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Proveedor } from '@/lib/types'

// EF-3 3B-6: getProveedores() lee TODAS las filas activas vía la RPC
// proveedores_pagina_por_nombre (paginación por keyset con comparación de
// tupla (nombre, id) hecha en Postgres, nunca reordenada en Node) -- ver
// docs/archive/ef-3-engineering-hardening.md #3B-6. Estos tests mockean la
// respuesta por página de la RPC; la verificación empírica del max_rows
// real (1000 sin el fix, 1,200 con el fix) y la paridad de orden contra
// nombres con `,`/`(`/`)`/acentos/ñ se hicieron a mano contra
// serenata-erp-test, documentadas en el PR.
const PAGE_SIZE = 500

const mocks = vi.hoisted(() => ({ rpcMock: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { rpc: mocks.rpcMock } }))

import { getProveedores } from '../proveedores'

function proveedorFixture(id: string, nombre: string): Proveedor {
  return {
    id,
    nombre,
    telefono: null,
    correo: null,
    banco: null,
    clabe: null,
    roles: [],
    notas: null,
    activo: true,
    created_at: '2026-01-01',
    regimen_fiscal: null,
    password_hash: null,
    portal_estado: null,
    match_candidato_id: null,
    session_version: 0,
  }
}

describe('getProveedores', () => {
  beforeEach(() => {
    mocks.rpcMock.mockReset()
  })

  it('concatena 3 páginas keyset (500/500/200) en el orden que ya devuelve la RPC, sin reordenar en Node', async () => {
    const pages: Proveedor[][] = [
      Array.from({ length: 500 }, (_, i) => proveedorFixture(`a-${i}`, `Nombre ${String(i).padStart(4, '0')}`)),
      Array.from({ length: 500 }, (_, i) => proveedorFixture(`b-${i}`, `Nombre ${String(500 + i).padStart(4, '0')}`)),
      Array.from({ length: 200 }, (_, i) => proveedorFixture(`c-${i}`, `Nombre ${String(1000 + i).padStart(4, '0')}`)),
    ]
    let call = 0
    mocks.rpcMock.mockImplementation(() => {
      const page = pages[call]
      call += 1
      return Promise.resolve({ data: page, error: null })
    })

    const result = await getProveedores()

    expect(mocks.rpcMock).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(1200)
    expect(result.map((p) => p.id)).toEqual([...pages[0], ...pages[1], ...pages[2]].map((p) => p.id))
  })

  it('pasa el cursor (nombre, id) de la última fila de cada página a la siguiente llamada', async () => {
    // page1 debe traer exactamente PAGE_SIZE filas para que el loop no se
    // detenga ahí -- una página corta es la señal de "última página".
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => proveedorFixture(`p-${i}`, `Nombre ${String(i).padStart(4, '0')}`))
    const page2: Proveedor[] = []
    mocks.rpcMock
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })

    await getProveedores()

    const ultima = page1[page1.length - 1]
    expect(mocks.rpcMock).toHaveBeenNthCalledWith(1, 'proveedores_pagina_por_nombre', {
      p_cursor_nombre: null,
      p_cursor_id: null,
      p_page_size: PAGE_SIZE,
    })
    expect(mocks.rpcMock).toHaveBeenNthCalledWith(2, 'proveedores_pagina_por_nombre', {
      p_cursor_nombre: ultima.nombre,
      p_cursor_id: ultima.id,
      p_page_size: PAGE_SIZE,
    })
  })

  it('se detiene en la primera página si trae menos de PAGE_SIZE filas', async () => {
    const page = [proveedorFixture('x1', 'Ana'), proveedorFixture('x2', 'Bravo')]
    mocks.rpcMock.mockResolvedValue({ data: page, error: null })

    const result = await getProveedores()

    expect(mocks.rpcMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
  })

  it('lanza explícito si el circuit breaker se agota -- nunca un array parcial', async () => {
    mocks.rpcMock.mockImplementation(() => {
      const page = Array.from({ length: PAGE_SIZE }, (_, i) => proveedorFixture(`z-${i}`, `Nombre ${i}`))
      return Promise.resolve({ data: page, error: null })
    })

    await expect(getProveedores()).rejects.toThrow(/circuit breaker/)
  })

  it('propaga el error de Supabase sin transformarlo', async () => {
    const dbError = new Error('conexión perdida')
    mocks.rpcMock.mockResolvedValue({ data: null, error: dbError })

    await expect(getProveedores()).rejects.toBe(dbError)
  })
})
