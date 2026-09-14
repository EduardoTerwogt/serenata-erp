import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Proyecto } from '@/lib/types'

// EF-3 3B-5: getProyectos() lee TODAS las filas de la tabla vía paginación
// por keyset (created_at, id) en vez de una sola página -- un .limit() del
// lado cliente no vence el cap real de PostgREST (max_rows=1000, ver
// docs/EF-3_ENGINEERING_HARDENING.md #3B-5). Estos tests mockean la
// respuesta por página, sin depender del contenido real de los filtros
// .or() -- solo verifican que el loop de concatenación/parada/circuit
// breaker se comporta correctamente. La verificación empírica del max_rows
// real (1000 sin el fix, 1,200 con el fix) se hizo a mano contra
// serenata-erp-test, documentada en el PR.
const PAGE_SIZE = 500

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.fromMock } }))

import { getProyectos } from '../proyectos'

function proyectoFixture(id: string, createdAt: string): Proyecto {
  return {
    id,
    cliente: 'Cliente',
    proyecto: 'Proyecto',
    fecha_entrega: null,
    locacion: null,
    horarios: null,
    punto_encuentro: null,
    estado: 'RODAJE',
    notas: null,
    created_at: createdAt,
  } as Proyecto
}

function makeChainableBuilder(nextPage: () => { data: unknown[] | null; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    or: () => builder,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(nextPage()).then(resolve, reject),
  }
  return builder
}

describe('getProyectos', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
  })

  it('concatena 3 páginas keyset (500/500/200) en el orden correcto', async () => {
    const pages: Proyecto[][] = [
      Array.from({ length: 500 }, (_, i) => proyectoFixture(`a-${i}`, '2026-03-01')),
      Array.from({ length: 500 }, (_, i) => proyectoFixture(`b-${i}`, '2026-02-01')),
      Array.from({ length: 200 }, (_, i) => proyectoFixture(`c-${i}`, '2026-01-01')),
    ]
    let call = 0
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== 'proyectos') throw new Error(`tabla no mockeada: ${table}`)
      const page = pages[call]
      call += 1
      return makeChainableBuilder(() => ({ data: page, error: null }))
    })

    const result = await getProyectos()

    expect(mocks.fromMock).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(1200)
    expect(result.map((p) => p.id)).toEqual([...pages[0], ...pages[1], ...pages[2]].map((p) => p.id))
  })

  it('se detiene en la primera página si trae menos de PAGE_SIZE filas', async () => {
    const page = Array.from({ length: 3 }, (_, i) => proyectoFixture(`x-${i}`, '2026-01-01'))
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== 'proyectos') throw new Error(`tabla no mockeada: ${table}`)
      return makeChainableBuilder(() => ({ data: page, error: null }))
    })

    const result = await getProyectos()

    expect(mocks.fromMock).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(3)
  })

  it('lanza explícito si el circuit breaker se agota -- nunca un array parcial', async () => {
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== 'proyectos') throw new Error(`tabla no mockeada: ${table}`)
      const page = Array.from({ length: PAGE_SIZE }, (_, i) => proyectoFixture(`z-${i}`, '2026-01-01'))
      return makeChainableBuilder(() => ({ data: page, error: null }))
    })

    await expect(getProyectos()).rejects.toThrow(/circuit breaker/)
  })

  it('propaga el error de Supabase sin transformarlo', async () => {
    const dbError = new Error('conexión perdida')
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== 'proyectos') throw new Error(`tabla no mockeada: ${table}`)
      return makeChainableBuilder(() => ({ data: null, error: dbError }))
    })

    await expect(getProyectos()).rejects.toBe(dbError)
  })
})
