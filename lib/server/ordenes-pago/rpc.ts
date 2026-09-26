/**
 * Rediseño de Cuentas B6: acceso a la BD de "Nueva orden", historial y
 * cancelación. La forma de las respuestas la arma preview-cuentas.ts (puro).
 */
import { DomainError } from '@/lib/server/errors/domain-error'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { HistorialOrdenesRespuesta } from '@/lib/shared/cuentas/ordenes-tipos'
import type { CandidatosCrudos } from './preview-cuentas'

export async function cargarCandidatosOrden(): Promise<CandidatosCrudos> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_orden_candidatos', { p_limite_no_incluidas: 100 })
  if (error) throw error
  return data as CandidatosCrudos
}

export async function buscarOrdenesCuentas(
  filtros: { estado?: string; mes?: string; proveedor?: string; proyecto?: string; q?: string },
  page: number,
  pageSize: number
): Promise<HistorialOrdenesRespuesta> {
  const { data, error } = await supabaseAdmin.rpc('buscar_ordenes_pago', { p_filtros: filtros, p_page: page, p_page_size: pageSize })
  if (error) throw error
  return data as HistorialOrdenesRespuesta
}

const MENSAJES_CANCELAR: Record<string, string> = {
  orden_con_pagos: 'La orden ya tiene pagos registrados: no se puede cancelar.',
  orden_cancelada: 'La orden ya estaba cancelada.',
  motivo_requerido: 'Escribe el motivo de la cancelación.',
}

/** D7: cancelar libera las cuentas; los errores esperados salen como DomainError 409. */
export async function cancelarOrdenPago(ordenId: string, motivo: string, usuario: string) {
  const { data, error } = await supabaseAdmin.rpc('cancelar_orden_pago', { p_orden_id: ordenId, p_motivo: motivo, p_usuario: usuario })
  if (error) {
    const codigo = (error.message ?? '').split(':')[0]
    if (error.code === 'P1415' && MENSAJES_CANCELAR[codigo]) {
      throw new DomainError({ code: codigo, status: 409, safeMessage: MENSAJES_CANCELAR[codigo], cause: error })
    }
    if (error.code === 'P0002') throw new DomainError({ code: 'orden_no_encontrada', status: 404, safeMessage: 'La orden no existe.', cause: error })
    throw error
  }
  return data as { orden_pago_id: string; grupos: number; cuentas: number }
}
