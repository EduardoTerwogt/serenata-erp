import { describe, expect, it } from 'vitest'
import { bulkCleanupLoadTestRun, discoverIdsByPrefix, discoverIdsWhereIn } from '../bulk-cleanup.mjs'

// EF-3A 3A-4: .range() sin .order() no garantiza un orden estable entre
// páginas en Postgres -- este bloque usa keyset por `id` en su lugar. Estas
// pruebas confirman que >500 filas en 2 páginas se juntan todas sin
// duplicar ni omitir, mockeando el builder encadenable de supabase-js.

function makeChainableSupabase(pagesByCall) {
  let callIndex = 0
  const builder = {
    from: () => builder,
    select: () => builder,
    ilike: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    gt: () => builder,
    then: (resolve) => {
      const page = pagesByCall[callIndex] ?? { data: [], error: null }
      callIndex += 1
      resolve(page)
    },
  }
  return { from: () => builder }
}

describe('discoverIdsByPrefix', () => {
  it('junta 2 páginas (500 + 10) sin duplicar ni omitir, ordenadas por id', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `id-${String(i).padStart(4, '0')}` }))
    const page2 = Array.from({ length: 10 }, (_, i) => ({ id: `id-${String(500 + i).padStart(4, '0')}` }))
    const supabaseAdmin = makeChainableSupabase([
      { data: page1, error: null },
      { data: page2, error: null },
    ])

    const ids = await discoverIdsByPrefix(supabaseAdmin, 'cotizaciones', 'cliente', 'run-1')

    expect(ids).toHaveLength(510)
    expect(new Set(ids).size).toBe(510)
    expect(ids[0]).toBe('id-0000')
    expect(ids[509]).toBe('id-0509')
  })

  it('una sola página (< PAGE_SIZE) no pide una segunda', async () => {
    const supabaseAdmin = makeChainableSupabase([
      { data: [{ id: 'a' }, { id: 'b' }], error: null },
    ])
    const ids = await discoverIdsByPrefix(supabaseAdmin, 'proveedores', 'correo', 'run-1')
    expect(ids).toEqual(['a', 'b'])
  })

  it('propaga el error si la query falla', async () => {
    const supabaseAdmin = makeChainableSupabase([{ data: null, error: new Error('db down') }])
    await expect(discoverIdsByPrefix(supabaseAdmin, 'proveedores', 'correo', 'run-1')).rejects.toThrow('db down')
  })
})

describe('discoverIdsWhereIn', () => {
  it('trocea valores > CHUNK_SIZE (150) y junta todos los ids sin duplicar', async () => {
    const values = Array.from({ length: 200 }, (_, i) => `cot-${i}`)
    // 2 chunks de .in() (150 + 50), cada uno con 1 página propia.
    const chunk1Ids = Array.from({ length: 150 }, (_, i) => ({ id: `item-${i}` }))
    const chunk2Ids = Array.from({ length: 50 }, (_, i) => ({ id: `item-${150 + i}` }))
    const supabaseAdmin = makeChainableSupabase([
      { data: chunk1Ids, error: null },
      { data: chunk2Ids, error: null },
    ])

    const ids = await discoverIdsWhereIn(supabaseAdmin, 'items_cotizacion', 'cotizacion_id', values)

    expect(ids).toHaveLength(200)
    expect(new Set(ids).size).toBe(200)
  })
})

// Frente 2 de Cuentas (cuentas-escrituras.js): aprobar una cotización crea
// grupos de pago, y cuentas_pagar_grupos.proyecto_id referencia a proyectos.
describe('bulkCleanupLoadTestRun -- cotizaciones aprobadas', () => {
  function makeFakeSupabase(dataByTable) {
    const borrados = []
    const from = (table) => {
      let esDelete = false
      const builder = {
        select: () => builder,
        ilike: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        gt: () => builder,
        delete: () => {
          esDelete = true
          return builder
        },
        then: (resolve) => {
          if (esDelete) {
            borrados.push(table)
            resolve({ error: null })
          } else {
            resolve({ data: dataByTable[table] ?? [], error: null })
          }
        },
      }
      return builder
    }
    return { from, borrados }
  }

  it('borra los grupos de pago después de las cuentas por pagar y antes que el proyecto', async () => {
    const supabaseAdmin = makeFakeSupabase({
      cotizaciones: [{ id: 'SH900' }],
      cuentas_pagar: [{ id: 'cp-1' }],
      cuentas_pagar_grupos: [{ id: 'g-1' }, { id: 'g-2' }],
      cuentas_cobrar: [{ id: 'cc-1' }],
    })

    const counts = await bulkCleanupLoadTestRun(supabaseAdmin, 'run-1')

    const orden = supabaseAdmin.borrados
    expect(counts.cuentas_pagar_grupos).toBe(2)
    expect(orden.indexOf('cuentas_pagar')).toBeGreaterThanOrEqual(0)
    expect(orden.indexOf('cuentas_pagar_grupos')).toBeGreaterThan(orden.indexOf('cuentas_pagar'))
    expect(orden.indexOf('proyectos')).toBeGreaterThan(orden.indexOf('cuentas_pagar_grupos'))
    expect(orden.indexOf('cotizaciones')).toBeGreaterThan(orden.indexOf('proyectos'))
  })
})
