/**
 * Rediseño de Cuentas B3/O1b: acceso a la BD de la lectura por periodo. Las
 * formas y su decodificación viven en módulos puros: `periodo-crudo.ts`
 * (lectura cruda) y `periodo-sql.ts` (periodo derivado en SQL).
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { MesPeriodo, PeriodoRespuesta, ResumenRespuesta } from '@/lib/shared/cuentas/periodo-tipos'
import type { CandidatoAviso } from './avisos'
import type { ParametrosPeriodo } from './periodo'
import { decodificarCuentasAnio, type CuentasAnioRaw } from './periodo-crudo'
import { decodificarPeriodoSql } from './periodo-sql'

/** Conceptos crudos del año; con `proyecto`, solo los de ese proyecto (el seleccionado). */
export async function cargarCuentasAnio(anio: number, proyecto?: string): Promise<CuentasAnioRaw> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_por_proyecto', proyecto ? { p_year: anio, p_proyecto: proyecto } : { p_year: anio })
  if (error) throw error
  return decodificarCuentasAnio(data)
}

/** Periodo ya derivado, filtrado y paginado en SQL (O1b). Sin `mes`, la BD aplica S16. */
export async function cargarPeriodo(
  params: Omit<ParametrosPeriodo, 'mes' | 'proyecto'> & { mes?: MesPeriodo },
  hoy: string
): Promise<Omit<PeriodoRespuesta, 'seleccionado'>> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_periodo', { p: { ...params, hoy } })
  if (error) throw error
  return decodificarPeriodoSql(data)
}

/** Años con pendientes y contador de avisos (S4), sobre todos los años. */
export async function cargarResumen(hoy: string): Promise<ResumenRespuesta> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_resumen', { p_hoy: hoy })
  if (error) throw error
  return data as ResumenRespuesta
}

/** Conceptos que entran a cada categoría de avisos; `agruparAvisos` les pone texto y orden. */
export async function cargarCandidatosAvisos(hoy: string): Promise<CandidatoAviso[]> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_avisos_items', { p_hoy: hoy })
  if (error) throw error
  return (data as CandidatoAviso[] | null) ?? []
}
