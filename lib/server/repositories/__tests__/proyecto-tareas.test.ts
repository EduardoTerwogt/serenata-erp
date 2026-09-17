import { beforeEach, describe, expect, it, vi } from 'vitest'

// EF-3 3B-5: getTareasAgregadas() pagina por keyset con cursor nullable en
// fecha_limite (ORDER BY fecha_limite ASC NULLS LAST, id ASC) -- 2 ramas
// explícitas porque NULLS LAST pone TODAS las filas fecha_limite IS NULL
// después de TODAS las no-nulas, sin importar el valor del cursor (ver
// docs/archive/ef-3-engineering-hardening.md #3B-5).
//
// El mock actúa de oráculo: dado el dataset completo ya ordenado como lo
// haría Postgres, reproduce lo que el WHERE real devolvería para los
// argumentos de cursor que el repositorio efectivamente pasó a .or()/
// .is()/.gt() -- así el test detecta un bug de cómputo de cursor (rama
// equivocada, valor equivocado) y no solo un bug de loop.
const PAGE_SIZE = 500

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('@/lib/server/supabase-admin', () => ({ supabaseAdmin: { from: mocks.fromMock } }))

import { getTareasAgregadas } from '../proyecto-tareas'

function tareaFixture(id: string, fechaLimite: string | null): Record<string, unknown> {
  return {
    id,
    proyecto_id: 'proy-1',
    titulo: `Tarea ${id}`,
    descripcion: null,
    estado: 'PENDIENTE',
    asignado_a: null,
    es_hito: false,
    origen: 'manual',
    fecha_limite: fechaLimite,
    fecha_completada: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    proveedores: null,
    proyectos: { proyecto: 'Proyecto X', cliente: 'Cliente X', estado: 'RODAJE' },
  }
}

// 600 filas con fecha_limite no nula (ascendente, únicas -- el orden por id
// no se ejercita entre ellas) + 600 filas con fecha_limite NULL (ordenadas
// por id ascendente) -- cruza la frontera PAGE_SIZE=500 dos veces: una vez
// dentro del bloque no-nulo -> nulo, otra vez avanzando dentro del bloque
// nulo mismo.
const nonNull = Array.from({ length: 600 }, (_, i) =>
  tareaFixture(`nn-${String(i).padStart(4, '0')}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.${String(i).padStart(6, '0')}Z`)
)
const nullBlock = Array.from({ length: 600 }, (_, i) => tareaFixture(`zz-${String(i).padStart(4, '0')}`, null))
const fullOrder = [...nonNull, ...nullBlock]

function parseOrArg(arg: string): { fechaLimite: string; id: string } {
  const match = arg.match(/^fecha_limite\.gt\.([^,]+),and\(fecha_limite\.eq\.[^,]+,id\.gt\.([^)]+)\),fecha_limite\.is\.null$/)
  if (!match) throw new Error(`filtro .or() con forma inesperada: ${arg}`)
  return { fechaLimite: match[1], id: match[2] }
}

function makeChainableBuilder() {
  let orArg: string | null = null
  let isArg: [string, unknown] | null = null
  let gtArg: [string, unknown] | null = null

  const builder: Record<string, unknown> = {
    select: () => builder,
    neq: () => builder,
    order: () => builder,
    limit: () => builder,
    or: (arg: string) => {
      orArg = arg
      return builder
    },
    is: (col: string, val: unknown) => {
      isArg = [col, val]
      return builder
    },
    gt: (col: string, val: unknown) => {
      gtArg = [col, val]
      return builder
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      let startIndex = 0
      if (orArg) {
        const { id } = parseOrArg(orArg)
        const cursorIndex = fullOrder.findIndex((row) => row.id === id)
        if (cursorIndex === -1) throw new Error(`cursor .or() no encontrado en el dataset: ${id}`)
        startIndex = cursorIndex + 1
      } else if (isArg && gtArg) {
        const cursorId = gtArg[1] as string
        const cursorIndex = fullOrder.findIndex((row) => row.id === cursorId)
        if (cursorIndex === -1) throw new Error(`cursor .is()+.gt() no encontrado en el dataset: ${cursorId}`)
        startIndex = cursorIndex + 1
      }
      const page = fullOrder.slice(startIndex, startIndex + PAGE_SIZE)
      return Promise.resolve({ data: page, error: null }).then(resolve, reject)
    },
  }
  return builder
}

describe('getTareasAgregadas', () => {
  beforeEach(() => {
    mocks.fromMock.mockReset()
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== 'proyecto_tareas') throw new Error(`tabla no mockeada: ${table}`)
      return makeChainableBuilder()
    })
  })

  it('lee las 1,200 filas completas cruzando la frontera no-nula -> nula y avanzando dentro del bloque nulo, sin perder ni duplicar', async () => {
    const result = await getTareasAgregadas()

    expect(result).toHaveLength(1200)
    expect(result.map((t) => t.id)).toEqual(fullOrder.map((t) => t.id))
    // 1200 filas / 500 por página = 3 páginas: [0-500) no-nula, [500-1000)
    // cruza a nula (500-600 no-nula + 600-1000 nula), [1000-1200) dentro del
    // bloque nulo -- ejercita ambas ramas del cursor.
    expect(mocks.fromMock).toHaveBeenCalledTimes(3)
  })

  it('mapea proyecto_nombre/proyecto_cliente desde el join y no filtra por fecha_limite', async () => {
    const result = await getTareasAgregadas()
    expect(result[0].proyecto_nombre).toBe('Proyecto X')
    expect(result[0].proyecto_cliente).toBe('Cliente X')
  })

  it('lanza explícito si el circuit breaker se agota -- nunca un array parcial', async () => {
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== 'proyecto_tareas') throw new Error(`tabla no mockeada: ${table}`)
      const builder: Record<string, unknown> = {
        select: () => builder,
        neq: () => builder,
        order: () => builder,
        limit: () => builder,
        or: () => builder,
        is: () => builder,
        gt: () => builder,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          const page = Array.from({ length: PAGE_SIZE }, (_, i) => tareaFixture(`inf-${i}`, null))
          return Promise.resolve({ data: page, error: null }).then(resolve, reject)
        },
      }
      return builder
    })

    await expect(getTareasAgregadas()).rejects.toThrow(/circuit breaker/)
  })

  it('propaga el error de Supabase sin transformarlo', async () => {
    const dbError = new Error('conexión perdida')
    mocks.fromMock.mockImplementation((table: string) => {
      if (table !== 'proyecto_tareas') throw new Error(`tabla no mockeada: ${table}`)
      const builder: Record<string, unknown> = {
        select: () => builder,
        neq: () => builder,
        order: () => builder,
        limit: () => builder,
        or: () => builder,
        is: () => builder,
        gt: () => builder,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: null, error: dbError }).then(resolve, reject),
      }
      return builder
    })

    await expect(getTareasAgregadas()).rejects.toBe(dbError)
  })
})
