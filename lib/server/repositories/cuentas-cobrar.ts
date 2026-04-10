import { supabaseAdmin } from '@/lib/supabase'
import {
  CuentaCobrar,
  DocumentoCuentaCobrar,
  EstadoCuentaCobrar,
  PagoComprobante,
  Cotizacion,
} from '@/lib/types'

export async function getCuentasCobrar() {
  const { data, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('*')
    .order('created_at', { ascending: false })
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
  const { data, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .upsert({
      cotizacion_id: cotizacion.id,
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

export async function deleteDocumentoCuentaCobrar(id: string) {
  const { error } = await supabaseAdmin
    .from('documentos_cuentas_cobrar')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function createPagoComprobante(pago: Partial<PagoComprobante>) {
  const { data, error } = await supabaseAdmin
    .from('pagos_comprobantes')
    .insert(pago)
    .select()
    .single()
  if (error) throw error
  return data as PagoComprobante
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
