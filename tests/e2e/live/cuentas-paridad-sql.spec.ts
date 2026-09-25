import { test, expect } from '@playwright/test'
import { AVISOS_POR_CATEGORIA, agruparAvisos, derivarAvisos, type CandidatoAviso } from '@/lib/server/cuentas/avisos'
import {
  construirOpciones,
  construirPeriodo,
  construirProyectos,
  pendientesPorAnio,
  seleccionarProyecto,
  ultimoMesConDatos,
  type ParametrosPeriodo,
} from '@/lib/server/cuentas/periodo'
import { decodificarCuentasAnio } from '@/lib/server/cuentas/periodo-crudo'
import { decodificarPeriodoSql } from '@/lib/server/cuentas/periodo-sql'
import { SIN_PROYECTO_ID, type CategoriaAviso, type ProyectoDetalle } from '@/lib/shared/cuentas/periodo-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import { getLiveSupabaseAdmin } from '../utils/live-cleanup'
import { liveEnabled } from '../utils/live-helpers'

/**
 * Rediseño de Cuentas O1b (docs/PLAN.md): la lectura por periodo, el resumen
 * y los avisos se derivan en SQL (db/migrations/20261003_cuentas_o1b_derivacion_sql.sql).
 * La derivación de referencia sigue siendo la de TS (concepto.ts, periodo.ts,
 * avisos.ts): este test corre ambas sobre la misma BD de test (dataset de
 * carga) y exige resultados idénticos para varias combinaciones de filtros.
 * Solo lee.
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
        expect(sql[k], `${etiqueta} → ${k}`).toEqual(ts[k])
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

  test('proyecto seleccionado: la lectura de un solo proyecto deriva igual que el año', async () => {
    const supabase = getLiveSupabaseAdmin()
    const hoy = hoyCdmx()
    const anio = Number(hoy.slice(0, 4))
    const proyectos = construirProyectos(decodificarCuentasAnio(await rpc(supabase, 'cuentas_por_proyecto', { p_year: anio })), hoy)
    const ids = [
      ...proyectos.filter((p) => !p.sin_fecha).slice(0, 3).map((p) => p.id),
      ...proyectos.filter((p) => p.sin_fecha && !p.sin_proyecto).slice(0, 1).map((p) => p.id),
      SIN_PROYECTO_ID,
    ]
    for (const id of ids) {
      const params = { tipo: 'todo' as const, proyecto: id }
      const uno = construirProyectos(decodificarCuentasAnio(await rpc(supabase, 'cuentas_por_proyecto', { p_year: anio, p_proyecto: id })), hoy)
      expect(seleccionarProyecto(uno, params), id).toEqual(seleccionarProyecto(proyectos, params))
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
