/**
 * Rediseño de Cuentas B3/O1b/B6: acceso a la BD de la lectura por periodo. Todo se deriva
 * en SQL; la decodificación vive en el módulo puro `periodo-sql.ts`.
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { CategoriaAviso, MesPeriodo, OpcionesFiltros, ParametrosPeriodo, PeriodoRespuesta, ResumenRespuesta } from '@/lib/shared/cuentas/periodo-tipos'
import { AVISOS_POR_CATEGORIA, type CandidatoAviso } from './avisos'
import { decodificarPeriodoSql } from './periodo-sql'

/**
 * Periodo ya derivado, filtrado y paginado en SQL (O1b), con el proyecto abierto en el panel
 * (`proyecto`) incluido (B6). Sin `mes`, la BD aplica S16.
 */
export async function cargarPeriodo(
  params: Omit<ParametrosPeriodo, 'mes'> & { mes?: MesPeriodo },
  hoy: string
): Promise<PeriodoRespuesta> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_periodo', { p: { ...params, hoy } })
  if (error) throw error
  return decodificarPeriodoSql(data)
}

/** Opciones de los filtros del año (E6): se piden una vez por año, no con cada periodo. */
export async function cargarOpciones(anio: number): Promise<OpcionesFiltros> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_opciones', { p_year: anio })
  if (error) throw error
  return data as OpcionesFiltros
}

/** Años con pendientes y contador de avisos (S4), sobre todos los años. */
export async function cargarResumen(hoy: string): Promise<ResumenRespuesta> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_resumen', { p_hoy: hoy })
  if (error) throw error
  return data as ResumenRespuesta
}

/**
 * Por categoría de avisos, los conceptos más urgentes (ya recortados) y
 * cuántos hay; `agruparAvisos` les pone texto.
 */
export async function cargarCandidatosAvisos(
  hoy: string
): Promise<{ items: CandidatoAviso[]; totales: Partial<Record<CategoriaAviso, number>> }> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_avisos_items', { p_hoy: hoy, p_limite: AVISOS_POR_CATEGORIA })
  if (error) throw error
  const r = (data ?? {}) as { items?: CandidatoAviso[]; totales?: Partial<Record<CategoriaAviso, number>> }
  return { items: r.items ?? [], totales: r.totales ?? {} }
}
