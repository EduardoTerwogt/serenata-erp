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

/**
 * Documentos vigentes de una cuenta (#123, P27): su factura (el FACTURA_XML apuntado por
 * `cuentas_cobrar.factura_documento_id`, que no lleva ancla de cuenta), los PDF y complementos anclados a
 * esa factura, y lo que cuelga directo de la cuenta (OTRO y datos legados).
 */
export async function getDocumentosCuentaCobrar(cuentaId: string) {
  const { data: cuenta, error: cuentaError } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('factura_documento_id')
    .eq('id', cuentaId)
    .maybeSingle()
  if (cuentaError) throw cuentaError
  const facturaId = cuenta?.factura_documento_id ?? null
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .select('*')
    .or(facturaId ? `cuentas_cobrar_id.eq.${cuentaId},factura_documento_id.eq.${facturaId},id.eq.${facturaId}` : `cuentas_cobrar_id.eq.${cuentaId}`)
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

/** Línea de pago con los datos de su cabecera (`pagos`), tal como la devuelve el embed de Supabase. */
type LineaConCabecera = {
  id: string
  cuentas_cobrar_id: string
  monto: number
  pago_id: string
  pagos: {
    fecha_pago: string
    tipo_pago: PagoComprobante['tipo_pago']
    comprobante_url: string | null
    archivo_nombre: string | null
    notas: string | null
    created_at: string
    anulado_at: string | null
    anulado_motivo: string | null
  }
}

const COLS_LINEA = 'id, cuentas_cobrar_id, monto, pago_id, pagos!inner(fecha_pago, tipo_pago, comprobante_url, archivo_nombre, notas, created_at, anulado_at, anulado_motivo)'

/** Aplana línea + cabecera. `id` es el de la cabecera (el que usan anular y corregir). */
export function aPagoComprobante(l: LineaConCabecera): PagoComprobante {
  const h = l.pagos
  return {
    id: l.pago_id,
    pago_id: l.pago_id,
    linea_id: l.id,
    cuentas_cobrar_id: l.cuentas_cobrar_id,
    monto: Number(l.monto),
    tipo_pago: h.tipo_pago,
    fecha_pago: h.fecha_pago,
    comprobante_url: h.comprobante_url,
    archivo_nombre: h.archivo_nombre,
    notas: h.notas,
    created_at: h.created_at,
    anulado_at: h.anulado_at,
    anulado_motivo: h.anulado_motivo,
  }
}

/** Pagos vigentes de una cuenta (#123: la fecha, el tipo y el estado viven en la cabecera `pagos`). */
export async function getPagosComprobantesByCuenta(cuentaId: string) {
  const { data, error } = await supabaseAdmin
    .from('pagos_comprobantes')
    .select(COLS_LINEA)
    .eq('cuentas_cobrar_id', cuentaId)
    // B7 (R8): un pago anulado no cuenta.
    .is('pagos.anulado_at', null)
  if (error) throw error
  return ((data ?? []) as unknown as LineaConCabecera[])
    .map(aPagoComprobante)
    .sort((a, b) => b.fecha_pago.localeCompare(a.fecha_pago) || b.created_at.localeCompare(a.created_at))
}

/**
 * Todos los abonos con fecha_pago en [desde, hasta) sin importar la cuenta --
 * usado por el Dashboard ejecutivo (Fase 5.6) para sumar Ingresos reales por
 * periodo, a diferencia de getPagosComprobantesByCuenta que es por cuenta.
 */
export async function getPagosComprobantesEnRango(desde: string, hasta: string) {
  const { data, error } = await supabaseAdmin
    .from('pagos_comprobantes')
    .select(COLS_LINEA)
    .gte('pagos.fecha_pago', desde)
    .lt('pagos.fecha_pago', hasta)
    // B7 (R8): un pago anulado no es ingreso.
    .is('pagos.anulado_at', null)
  if (error) throw error
  return ((data ?? []) as unknown as LineaConCabecera[]).map(aPagoComprobante)
}
