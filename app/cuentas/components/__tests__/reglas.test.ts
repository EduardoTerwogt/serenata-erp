import { describe, expect, it } from 'vitest'
import { chipsActivos, reglasFiltros } from '../Filtros'
import { agruparProyectos } from '../Proyectos'
import type { EstadoCuentas } from '../useCuentasUrl'
import type { TarjetaProyecto } from '@/lib/shared/cuentas/periodo-tipos'

const base = { tipo: 'todo', cliente: '', proveedor: '' } as const

describe('reglasFiltros (README, controls de cuentas-data.js)', () => {
  it('"Pendientes" cambia el periodo a "Todo el año"', () => {
    expect(reglasFiltros(base, { estado: 'pendientes' })).toEqual({ estado: 'pendientes', mes: 'todo' })
    expect(reglasFiltros(base, { estado: 'cerradas' })).toEqual({ estado: 'cerradas' })
  })

  it('elegir Cliente limpia "Por pagar" y elegir Proveedor limpia "Por cobrar"', () => {
    expect(reglasFiltros({ ...base, tipo: 'pago' }, { cliente: 'Liverpool' })).toEqual({ cliente: 'Liverpool', tipo: 'todo' })
    expect(reglasFiltros({ ...base, tipo: 'cobro' }, { proveedor: 'Foros' })).toEqual({ proveedor: 'Foros', tipo: 'todo' })
    expect(reglasFiltros({ ...base, tipo: 'cobro' }, { cliente: 'Liverpool' })).toEqual({ cliente: 'Liverpool' })
  })

  it('"Por pagar" limpia Cliente y "Por cobrar" limpia Proveedor', () => {
    expect(reglasFiltros({ ...base, cliente: 'X' }, { tipo: 'pago' })).toEqual({ tipo: 'pago', cliente: '' })
    expect(reglasFiltros({ ...base, proveedor: 'Y' }, { tipo: 'cobro' })).toEqual({ tipo: 'cobro', proveedor: '' })
  })
})

describe('chipsActivos', () => {
  it('un chip por filtro distinto del default; la búsqueda no cuenta', () => {
    const e = { estado: 'pendientes', tipo: 'todo', cliente: 'Liverpool', proveedor: '', q: 'aurora' } as EstadoCuentas
    expect(chipsActivos(e).map((c) => c.k)).toEqual(['Estado', 'Cliente'])
  })
})

describe('agruparProyectos', () => {
  const p = (id: string, mes: number | null): TarjetaProyecto =>
    ({ id, nombre: id, mes, sin_fecha: mes === null }) as unknown as TarjetaProyecto

  it('por mes en "Todo el año" y "Sin fecha" siempre al final', () => {
    const g = agruparProyectos([p('a', 7), p('b', 7), p('c', 9)], [p('d', null)], 2026, true)
    expect(g.map((x) => [x.label, x.proyectos.length])).toEqual([
      ['Julio 2026', 2],
      ['Septiembre 2026', 1],
      ['Sin fecha', 1],
    ])
  })

  it('sin agrupar, un solo grupo sin encabezado', () => {
    expect(agruparProyectos([p('a', 7)], [], 2026, false)).toEqual([{ key: 'todos', label: null, proyectos: [p('a', 7)] }])
  })
})
