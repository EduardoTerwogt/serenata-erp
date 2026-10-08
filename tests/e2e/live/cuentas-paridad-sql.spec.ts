import { test, expect } from '@playwright/test'
import { AVISOS_POR_CATEGORIA, agruparAvisos, type CandidatoAviso } from '@/lib/server/cuentas/avisos'
import { derivarAvisos } from '../../support/cuentas-motor/avisos-derivar'
import { calcularCierreMensual } from '../../support/cuentas-motor/cierre-mensual'
import { calcularCierreProyecto } from '../../support/cuentas-motor/cierre-proyecto'
import {
  construirOpciones,
  construirPeriodo,
  construirProyectos,
  pendientesPorAnio,
  seleccionarProyecto,
  ultimoMesConDatos,
} from '../../support/cuentas-motor/periodo'
import { decodificarCuentasAnio } from '../../support/cuentas-motor/periodo-crudo'
import { decodificarPeriodoSql } from '@/lib/server/cuentas/periodo-sql'
import { SIN_PROYECTO_ID, type CategoriaAviso, type ParametrosPeriodo, type ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'
import { liveEnabled } from '../utils/live-helpers'

/**
 * Rediseño de Cuentas O1b (docs/PLAN.md): la lectura por periodo, el resumen
 * y los avisos se derivan en SQL (db/migrations/20261003_cuentas_o1b_derivacion_sql.sql).
 * SQL es la fuente de verdad (B6). El motor TS de tests/support/cuentas-motor
 * es el doble que usan los mocks e2e: este test corre ambos sobre la misma BD
 * de test (dataset de carga) y exige resultados idénticos para varias
 * combinaciones de filtros, incluido el proyecto seleccionado. Solo lee.
 */

type Supabase = ReturnType<typeof getLiveSupabaseAdmin>

async function rpc<T>(supabase: Supabase, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Mismo criterio que la ruta antes de O1b: sin mes, el actual en el año en curso; si no, S16. */
function mesPorDefecto(proyectos: ProyectoDetalle[], anio: number, hoy: string) {
  return anio === Number(hoy.slice(0, 4)) ? Number(hoy.slice(5, 7)) : ultimoMesConDatos(proyectos, anio)
}

/**
 * #123 (P20): SQL agrega a cada concepto el campo `compartido` (factura o pago que cubre varias cuentas, para el chip
 * de la lista). El doble TS está congelado y no lo conoce: se compara todo lo demás.
 */
function sinCompartido<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(sinCompartido) as unknown as T
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).filter(([k]) => k !== 'compartido').map(([k, v]) => [k, sinCompartido(v)])) as T
  }
  return valor
}

test.describe('live: paridad de la derivación SQL con la de TS (O1b)', () => {
  test.skip(!liveEnabled, 'Live integration tests are disabled until PLAYWRIGHT_BASE_URL and live credentials are configured')
  test.setTimeout(300_000)

  test('periodo: mismos meses, conteos, totales, tarjetas y lista', async () => {
    const supabase = getLiveSupabaseAdmin()
    const hoy = hoyCdmx()
    const anio = Number(hoy.slice(0, 4))
    const proyectos = construirProyectos(decodificarCuentasAnio(await rpc(supabase, 'cuentas_por_proyecto', { p_year: anio })), hoy)

    // Valores reales del año para los filtros de texto.
    const cliente = proyectos.flatMap((p) => p.conceptos).find((c) => c.tipo === 'cobro')?.contraparte
    const proveedor = proyectos.flatMap((p) => p.conceptos).find((c) => c.tipo === 'pago' && c.contraparte_id)?.contraparte
    const nombre = proyectos.find((p) => !p.sin_proyecto)?.nombre ?? ''
    const busqueda = nombre.slice(0, Math.min(6, nombre.length)).toUpperCase()

    const base: Omit<ParametrosPeriodo, 'mes'> & { mes?: ParametrosPeriodo['mes'] } = {
      anio, estado: 'todas', tipo: 'todo', vista: 'proyectos', page: 1, page_size: 60,
    }
    const casos: (typeof base)[] = [
      { ...base },
      { ...base, mes: 'todo' },
      { ...base, mes: 'todo', estado: 'pendientes' },
      { ...base, mes: 'todo', estado: 'cerradas', page: 2, page_size: 20 },
      { ...base, mes: 'todo', vista: 'lista' },
      { ...base, mes: 'todo', vista: 'lista', estado: 'pendientes', page: 3, page_size: 50 },
      { ...base, mes: 'todo', vista: 'lista', tipo: 'pago' },
      { ...base, mes: 'todo', tipo: 'cobro', cliente },
      { ...base, mes: 'todo', vista: 'lista', proveedor },
      { ...base, mes: 'todo', vista: 'lista', q: `  ${busqueda} ` },
      { ...base, mes: 'todo', q: 'CÓTIZACIÓN' },
      { ...base, anio: anio - 1 },
      { ...base, anio: 2001, mes: 'todo' },
    ]

    const porAnio = new Map<number, ProyectoDetalle[]>([[anio, proyectos]])
    for (const caso of casos) {
      if (!porAnio.has(caso.anio)) {
        porAnio.set(caso.anio, construirProyectos(decodificarCuentasAnio(await rpc(supabase, 'cuentas_por_proyecto', { p_year: caso.anio })), hoy))
      }
      const delAnio = porAnio.get(caso.anio)!
      const { seleccionado: _sel, ...ts } = construirPeriodo(delAnio, { ...caso, mes: caso.mes ?? mesPorDefecto(delAnio, caso.anio, hoy) }, hoy)
      void _sel
      const sql = decodificarPeriodoSql(await rpc(supabase, 'cuentas_periodo', { p: { ...caso, hoy } }))
      const etiqueta = JSON.stringify(caso)
      for (const k of Object.keys(ts) as (keyof typeof ts)[]) {
        expect(sinCompartido(sql[k]), `${etiqueta} → ${k}`).toEqual(ts[k])
      }
    }
  })

  test('opciones de filtro (E6): mismos clientes y proveedores del año', async () => {
    const supabase = getLiveSupabaseAdmin()
    const hoy = hoyCdmx()
    const anio = Number(hoy.slice(0, 4))
    for (const a of [anio, anio - 1, 2001]) {
      const proyectos = construirProyectos(decodificarCuentasAnio(await rpc(supabase, 'cuentas_por_proyecto', { p_year: a })), hoy)
      expect(await rpc(supabase, 'cuentas_opciones', { p_year: a }), String(a)).toEqual(construirOpciones(proyectos, a))
    }
  })

  test('proyecto seleccionado (B6): el que arma SQL coincide con el del doble TS', async () => {
    const supabase = getLiveSupabaseAdmin()
    const hoy = hoyCdmx()
    const anio = Number(hoy.slice(0, 4))
    const proyectos = construirProyectos(decodificarCuentasAnio(await rpc(supabase, 'cuentas_por_proyecto', { p_year: anio })), hoy)
    const ids = [
      ...proyectos.filter((p) => !p.sin_fecha).slice(0, 3).map((p) => p.id),
      ...proyectos.filter((p) => p.sin_fecha && !p.sin_proyecto).slice(0, 1).map((p) => p.id),
      SIN_PROYECTO_ID,
      'NO-EXISTE',
    ]
    // Sin filtros, con un filtro que deja conceptos y con uno que no deja ninguno (cae a todos).
    const filtros: { tipo: 'todo' | 'cobro' | 'pago'; q?: string }[] = [{ tipo: 'todo' }, { tipo: 'cobro' }, { tipo: 'pago' }, { tipo: 'todo', q: 'zzzz-sin-coincidencias' }]
    for (const id of ids) {
      for (const f of filtros) {
        const params = { anio, mes: 'todo' as const, estado: 'todas' as const, vista: 'proyectos' as const, page: 1, page_size: 60, proyecto: id, ...f }
        const sql = decodificarPeriodoSql(await rpc(supabase, 'cuentas_periodo', { p: { ...params, hoy } }))
        expect(sinCompartido(sql.seleccionado), `${id} ${JSON.stringify(f)}`).toEqual(seleccionarProyecto(proyectos, params))
      }
    }
  })

  test('cierre mensual (B6): cuentas_cierre_mensual da lo mismo que el doble TS en 300 casos', async () => {
    const supabase = getLiveSupabaseAdmin()
    // Generador determinista (mulberry32): mismo caso en cada corrida.
    let a = 20261028
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const entre = (min: number, max: number) => Math.round((min + rnd() * (max - min)) * 100) / 100
    const regimenes = ['moral', 'fisica', 'resico', null] as const
    const fecha = () => `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`
    const movs = (tope: number) => Array.from({ length: Math.floor(rnd() * 4) }, () => ({ fecha: fecha(), monto: entre(0, tope * 0.6) }))

    for (let n = 0; n < 300; n++) {
      const nProv = Math.floor(rnd() * 4)
      const cuentas = Array.from({ length: nProv }, (_, k) => ({
        id: `cp-${k}`, grupo_id: null, costo_total: entre(500, 90000), responsable_id: `p${k}`, responsable_nombre: `Prov ${k}`,
        proveedor_regimen_fiscal: regimenes[Math.floor(rnd() * regimenes.length)],
      }))
      const margen = entre(0, 120000)
      const cierre = calcularCierreProyecto(cuentas, margen, entre(0, 20000), entre(0, 40000), entre(0, 5000))
      const cobros = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
        const total = entre(1000, 200000)
        return { total, pagos: movs(total) }
      })
      const pagosProveedor: Record<string, { fecha: string; monto: number }[]> = {}
      for (const q of cierre.quien_cuanto_cuando) pagosProveedor[q.clave] = movs(q.total_a_transferir)

      const ts = calcularCierreMensual({ cierre, cobros, pagosProveedor })
      const sql = await rpc<unknown>(supabase, 'cuentas_cierre_mensual', { p_cierre: cierre, p_cobros: cobros, p_pagos: pagosProveedor })
      expect(sql, `caso ${n}`).toEqual(ts)
    }
  })

  test('detalle del concepto (B6): cuentas_conceptos de un concepto da la misma fila que la lista', async () => {
    const supabase = getLiveSupabaseAdmin()
    const hoy = hoyCdmx()
    const lista = await rpc<Record<string, unknown>[]>(supabase, 'cuentas_conceptos', { p_year: null, p_hoy: hoy, p_objetivo: null, p_id: null })
    // Una muestra de cada objetivo (cobro, grupo, cuenta) y de cada estado derivado.
    const vistos = new Set<string>()
    const muestra = lista.filter((c) => {
      const k = `${c.objetivo}|${c.estado}|${c.paso}`
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })
    expect(muestra.length).toBeGreaterThan(0)
    for (const c of muestra) {
      const uno = await rpc<Record<string, unknown>[]>(supabase, 'cuentas_conceptos', { p_year: null, p_hoy: hoy, p_objetivo: c.objetivo, p_id: c.id })
      expect(uno, String(c.key)).toHaveLength(1)
      // El orden del proyecto depende de cuántos proyectos hay en la lectura: no forma parte del concepto.
      const { proyecto_orden: _a, ...fila } = uno[0]
      const { proyecto_orden: _b, ...esperada } = c
      void _a
      void _b
      expect(fila, String(c.key)).toEqual(esperada)
    }
  })

  test('resumen y avisos: mismos años con pendientes, contador y categorías', async () => {
    const supabase = getLiveSupabaseAdmin()
    const hoy = hoyCdmx()
    const anios = await rpc<number[]>(supabase, 'cuentas_anios', {})

    // Referencia: todos los años, con "Sin fecha" y "Sin proyecto" una sola vez.
    const vistos = new Set<string>()
    const todos: ProyectoDetalle[] = []
    const pendientes: { anio: number; pendientes: number }[] = []
    for (const anio of anios) {
      const proyectos = construirProyectos(decodificarCuentasAnio(await rpc(supabase, 'cuentas_por_proyecto', { p_year: anio })), hoy)
      pendientes.push({ anio, pendientes: pendientesPorAnio(proyectos, anio) })
      for (const p of proyectos) {
        if (vistos.has(p.id)) continue
        vistos.add(p.id)
        todos.push(p)
      }
    }
    const avisos = derivarAvisos(todos, hoy)

    expect(await rpc(supabase, 'cuentas_resumen', { p_hoy: hoy })).toEqual({ hoy, anios: pendientes, avisos: avisos.total })
    const sql = await rpc<{ items: CandidatoAviso[]; totales: Partial<Record<CategoriaAviso, number>> }>(
      supabase, 'cuentas_avisos_items', { p_hoy: hoy, p_limite: AVISOS_POR_CATEGORIA }
    )
    expect(agruparAvisos(sql.items, hoy, sql.totales)).toEqual(avisos)
  })
})
