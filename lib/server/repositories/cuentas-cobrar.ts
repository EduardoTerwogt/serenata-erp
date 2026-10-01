import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  CuentaCobrar,
  CuentaCobrarUpdate,
  DocumentoCuentaCobrar,
  PagoComprobante,
} from '@/lib/types'

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

/**
 * Solo columnas escribibles (PLAN.md, N2): `estado` es una columna generada y
 * `monto_pagado`/`fecha_pago` solo los mueven las RPCs de pago. TypeScript
 * rechaza cualquier otra clave.
 */
export async function updateCuentaCobrar(id: string, updates: CuentaCobrarUpdate) {
  const { data, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .update(updates)
    .eq('id', id)
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
    // B7: un documento dado de baja nunca es vigente (T7); vive solo en el historial del detalle.
    .is('eliminado_at', null)
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

export async function getPagosComprobantesByCuenta(cuentaId: string) {
  const { data, error } = await supabaseAdmin
    .from('pagos_comprobantes')
    .select('*')
    .eq('cuentas_cobrar_id', cuentaId)
    // B7 (R8): un pago anulado no cuenta.
    .is('anulado_at', null)
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
    // B7 (R8): un pago anulado no es ingreso.
    .is('anulado_at', null)
  if (error) throw error
  return data as PagoComprobante[]
}
