/**
 * Rediseño de Cuentas B3: acceso a la BD de la lectura por periodo. La forma
 * cruda y su decodificación viven en `periodo-crudo.ts` (puro).
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { calcularCierreProyecto } from '@/lib/shared/cierre-proyecto'
import type { ProyectoConCuentasRPC } from '@/lib/types'
import { decodificarCuentasAnio, type CuentasAnioRaw } from './periodo-crudo'

export async function cargarCuentasAnio(anio: number): Promise<CuentasAnioRaw> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_por_proyecto', { p_year: anio })
  if (error) throw error
  return decodificarCuentasAnio(data)
}

export async function cargarAniosCuentas(): Promise<number[]> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_anios')
  if (error) throw error
  return ((data as number[] | null) ?? []).map(Number)
}

/** Lógica de `/api/cuentas/por-proyecto` (vista actual, hasta B8): la RPC sin año más el cierre por proyecto. */
export async function obtenerCuentasPorProyecto() {
  const { data, error } = await supabaseAdmin.rpc('cuentas_por_proyecto')
  if (error) throw error
  return (data as ProyectoConCuentasRPC[]).map((p) => ({
    ...p,
    cierre: calcularCierreProyecto(p.cuentas_pagar, p.margen_total_proyecto, p.fee_agencia_proyecto, p.iva_total_proyecto),
  }))
}
