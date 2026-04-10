import { getItemsByCotizacion } from '@/lib/db/cotizaciones'
import { supabaseAdmin } from '@/lib/supabase'
import {
  Cotizacion,
  CuentaCobrar,
  CuentaPagar,
  DocumentoCuentaCobrar,
  DocumentoCuentaPagar,
  EstadoCuentaCobrar,
  ItemCotizacion,
  OrdenPago,
  PagoComprobante,
} from '@/lib/types'

export async function getCuentasPagar() {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CuentaPagar[]
}

export async function updateCuentaPagar(id: string, updates: Partial<CuentaPagar>) {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as CuentaPagar
}

export async function deleteCuentasPagarByCotizacion(cotizacionId: string) {
  const { error } = await supabaseAdmin
    .from('cuentas_pagar')
    .delete()
    .eq('cotizacion_id', cotizacionId)
  if (error) throw error
}

export async function createCuentasPagarDesdeCotizacion(cotizacionId: string) {
  const items = await getItemsByCotizacion(cotizacionId)

  const cuentas = items
    .filter(item => item.x_pagar > 0)
    .map(item => ({
      cotizacion_id: cotizacionId,
      proyecto_id: cotizacionId,
      item_id: item.id,
      responsable_nombre: item.responsable_nombre || 'Sin asignar',
      responsable_id: item.responsable_id,
      item_descripcion: item.descripcion,
      cantidad: item.cantidad,
      x_pagar: item.x_pagar,
      margen: item.margen,
      estado: 'PENDIENTE',
    }))

  if (cuentas.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .insert(cuentas)
    .select()
  if (error) throw error
  return data as CuentaPagar[]
}

export async function createCuentasPagarConProyecto(
  cotizacionId: string,
  proyectoId: string,
  items: ItemCotizacion[]
) {
  const cuentas = items
    .filter(item => item.x_pagar > 0)
    .map(item => ({
      cotizacion_id: cotizacionId,
      proyecto_id: proyectoId,
      item_id: item.id,
      responsable_nombre: item.responsable_nombre || 'Sin asignar',
      responsable_id: item.responsable_id,
      item_descripcion: item.descripcion,
      cantidad: item.cantidad,
      x_pagar: item.x_pagar,
      margen: item.margen,
      estado: 'PENDIENTE',
    }))

  if (cuentas.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .insert(cuentas)
    .select()
  if (error) throw error
  return data as CuentaPagar[]
}

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

export async function createDocumentoCuentaPagar(documento: Partial<DocumentoCuentaPagar>) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .insert(documento)
    .select()
    .single()
  if (error) throw error
  return data as DocumentoCuentaPagar
}

export async function getDocumentosCuentaPagar(cuentaId: string) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .select('*')
    .eq('cuentas_pagar_id', cuentaId)
    .order('fecha_carga', { ascending: false })
  if (error) throw error
  return data as DocumentoCuentaPagar[]
}

export async function deleteDocumentoCuentaPagar(id: string) {
  const { error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function createOrdenPago(orden: Partial<OrdenPago>) {
  const { data, error } = await supabaseAdmin
    .from('ordenes_pago')
    .insert(orden)
    .select()
    .single()
  if (error) throw error
  return data as OrdenPago
}

export async function getOrdenPagoById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('ordenes_pago')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as OrdenPago
}

export async function getOrdenesPago() {
  const { data, error } = await supabaseAdmin
    .from('ordenes_pago')
    .select('*')
    .order('fecha_generacion', { ascending: false })
  if (error) throw error
  return data as OrdenPago[]
}

export async function updateOrdenPago(id: string, updates: Partial<OrdenPago>) {
  const { data, error } = await supabaseAdmin
    .from('ordenes_pago')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as OrdenPago
}

export async function getCuentasPagarPendientesEventosRealizados() {
  type CuentaPagarPendienteConEntrega = {
    cotizaciones: { fecha_entrega: string | null } | null
  }

  const hoy = new Date().toISOString().split('T')[0]
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select(`
      *,
      cotizaciones(fecha_entrega, proyecto),
      proyectos(proyecto)
    `)
    .eq('estado', 'PENDIENTE')
    .order('responsable_nombre', { ascending: true })
    .order('cotizacion_id', { ascending: true })
  if (error) throw error
  const cuentas = (data || []) as CuentaPagarPendienteConEntrega[]

  return cuentas.filter((cuenta) => {
    const fechaEntrega = cuenta.cotizaciones?.fecha_entrega
    return fechaEntrega && fechaEntrega <= hoy
  })
}

export function calcularEstadoCuentaCobrar(montoPagado: number, montoTotal: number): EstadoCuentaCobrar {
  if (montoPagado === 0) return 'FACTURADO'
  if (montoPagado >= montoTotal) return 'PAGADO'
  return 'PARCIALMENTE_PAGADO'
}
