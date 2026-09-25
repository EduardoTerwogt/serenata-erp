import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  CuentaCobrar,
  DocumentoCuentaCobrar,
  EstadoCuentaCobrar,
  PagoComprobante,
  Cotizacion,
} from '@/lib/types'

export interface BuscarCuentasCobrarResult {
  rows: CuentaCobrar[]
  total_rows: number
  total_monto_pendiente: number
  total_monto_pagado: number
  pendientes_count: number
}

/**
 * EF-3 3B-2: busqueda/paginacion/totales server-side via RPC unica
 * (db/migrations/20260914_buscar_cuentas_cobrar.sql) -- reemplaza el
 * filtrado en JS sobre getCuentasCobrar() completo. La RPC ya llama
 * sync_estados_cuentas_cobrar_vencidas() (3B-1) internamente.
 */
export async function buscarCuentasCobrar(search: string | null, page: number, pageSize: number) {
  const { data, error } = await supabaseAdmin.rpc('buscar_cuentas_cobrar', {
    p_search: search,
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) throw error
  return data as BuscarCuentasCobrarResult
}

/**
 * Detalle por ID -- nunca a través de getCuentasCobrar().find() (1C-1).
 * .maybeSingle() nunca .single(): "no encontrada" debe seguir siendo un
 * 404 explícito del caller, no un error de Postgres por 0 filas.
 */
export async function getCuentaCobrarById(id: string): Promise<CuentaCobrar | null> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as CuentaCobrar | null
}

/**
 * Cuentas por cobrar de un proyecto puntual -- usado por el Reporte de
 * Cierre automático (Fase 5.2 Bloque 4) para el "cobrado real", mismo
 * patrón que getCuentasPagarByProyecto.
 */
export async function getCuentasCobrarByProyecto(proyectoId: string): Promise<CuentaCobrar[]> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('*')
    .eq('proyecto_id', proyectoId)
  if (error) throw error
  return data as CuentaCobrar[]
}

export async function updateCuentaCobrar(id: string, updates: Partial<CuentaCobrar>) {
  const { data, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CuentaCobrar
}

export async function createCuentaCobrar(cotizacion: Cotizacion) {
  // Misma regla que usa approve_cotizacion (RPC) para calcular v_proyecto_id:
  // si es complementaria, el proyecto es el de la principal; si no, la
  // principal comparte id con su proyecto.
  const proyecto_id = cotizacion.es_complementaria_de || cotizacion.id
  const { data, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .upsert({
      cotizacion_id: cotizacion.id,
      proyecto_id,
      cliente: cotizacion.cliente,
      proyecto: cotizacion.proyecto,
      monto_total: cotizacion.total,
      estado: 'FACTURA_PENDIENTE',
    }, { onConflict: 'cotizacion_id' })
    .select()
    .single()
  if (error) throw error
  return data as CuentaCobrar
}

export async function createDocumentoCuentaCobrar(documento: Partial<DocumentoCuentaCobrar>) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .insert(documento)
    .select()
    .single()
  if (error) throw error
  return data as DocumentoCuentaCobrar
}

export async function getDocumentosCuentaCobrar(cuentaId: string) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .select('*')
    .eq('cuentas_cobrar_id', cuentaId)
    .order('fecha_carga', { ascending: false })
  if (error) throw error
  return data as DocumentoCuentaCobrar[]
}

export async function updateDocumentoCuentaCobrar(id: string, updates: Partial<DocumentoCuentaCobrar>) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DocumentoCuentaCobrar
}

export async function deleteDocumentoCuentaCobrar(id: string) {
  const { error } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getPagosComprobantesByCuenta(cuentaId: string) {
  const { data, error } = await supabaseAdmin
    .from('pagos_comprobantes')
    .select('*')
    .eq('cuentas_cobrar_id', cuentaId)
    .order('fecha_pago', { ascending: false })
  if (error) throw error
  return data as PagoComprobante[]
}

/**
 * Todos los abonos con fecha_pago en [desde, hasta) sin importar la cuenta --
 * usado por el Dashboard ejecutivo (Fase 5.6) para sumar Ingresos reales por
 * periodo, a diferencia de getPagosComprobantesByCuenta que es por cuenta.
 */
export async function getPagosComprobantesEnRango(desde: string, hasta: string) {
  const { data, error } = await supabaseAdmin
    .from('pagos_comprobantes')
    .select('*')
    .gte('fecha_pago', desde)
    .lt('fecha_pago', hasta)
  if (error) throw error
  return data as PagoComprobante[]
}

export async function deletePagoComprobante(id: string) {
  const { error } = await supabaseAdmin
    .from('pagos_comprobantes')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export function calcularEstadoCuentaCobrar(montoPagado: number, montoTotal: number): EstadoCuentaCobrar {
  if (montoPagado === 0) return 'FACTURADO'
  if (montoPagado >= montoTotal) return 'PAGADO'
  return 'PARCIALMENTE_PAGADO'
}
