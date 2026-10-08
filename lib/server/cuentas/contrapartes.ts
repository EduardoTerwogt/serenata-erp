/**
 * #123 (B3, P2, P10, T17): a quién pertenecen las cuentas o grupos de una operación (factura o pago). Un pago o una
 * factura de cobro es de UN solo cliente; uno de proveedor, de UN solo proveedor. La RPC de proveedor ya lo exige;
 * la de cobro no tiene el cliente a la mano, así que se revisa aquí antes de tocar Drive.
 */
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { ContrapartesPendientes, PendienteContraparte } from '@/lib/shared/cuentas/contrapartes-tipos'
import type { LadoCuentas } from '@/lib/shared/cuentas/estado-cuenta-tipos'

export interface ContraparteResuelta {
  /** Null solo en cobros viejos cuya cotización no tiene cliente por llave. */
  id: string | null
  nombre: string
  rfc: string | null
}

export type ResolucionContraparte =
  | { ok: true; contraparte: ContraparteResuelta }
  | { ok: false; status: number; body: { error: string; message: string } }

const rechazo = (status: number, error: string, message: string): ResolucionContraparte => ({ ok: false, status, body: { error, message } })

export async function resolverContraparteDeDestinos(lado: LadoCuentas, ids: string[]): Promise<ResolucionContraparte> {
  const unicos = Array.from(new Set(ids))
  if (unicos.length === 0) return rechazo(400, 'lineas_requeridas', 'Falta al menos una cuenta.')

  if (lado === 'proveedor') {
    const { data: grupos, error } = await supabaseAdmin.from('cuentas_pagar_grupos').select('id, responsable_id').in('id', unicos)
    if (error) throw error
    if ((grupos ?? []).length !== unicos.length) return rechazo(404, 'destino_no_encontrado', 'Grupo de cuentas por pagar no encontrado.')
    const proveedores = Array.from(new Set((grupos ?? []).map((g) => g.responsable_id as string | null)))
    if (proveedores.length > 1 || proveedores[0] == null) {
      return rechazo(409, 'contrapartes_distintas', 'Un pago a proveedor cubre grupos de un solo proveedor.')
    }
    const { data: proveedor, error: errorProveedor } = await supabaseAdmin.from('proveedores').select('id, nombre, rfc').eq('id', proveedores[0]).maybeSingle()
    if (errorProveedor) throw errorProveedor
    if (!proveedor) return rechazo(404, 'contraparte_no_encontrada', 'Proveedor no encontrado.')
    return { ok: true, contraparte: { id: proveedor.id as string, nombre: proveedor.nombre as string, rfc: (proveedor.rfc as string | null) ?? null } }
  }

  const { data: cuentas, error } = await supabaseAdmin.from('cuentas_cobrar').select('id, cotizacion_id').in('id', unicos)
  if (error) throw error
  if ((cuentas ?? []).length !== unicos.length) return rechazo(404, 'destino_no_encontrado', 'Cuenta por cobrar no encontrada.')
  const cotizacionIds = Array.from(new Set((cuentas ?? []).map((c) => c.cotizacion_id as string | null).filter((c): c is string => !!c)))
  const { data: cotizaciones, error: errorCot } = cotizacionIds.length
    ? await supabaseAdmin.from('cotizaciones').select('id, cliente_id, cliente').in('id', cotizacionIds)
    : { data: [] as { id: string; cliente_id: string | null; cliente: string | null }[], error: null }
  if (errorCot) throw errorCot
  const clientes = Array.from(new Set((cotizaciones ?? []).map((c) => (c.cliente_id as string | null) ?? `texto:${c.cliente ?? ''}`)))
  if (clientes.length !== 1 || (cuentas ?? []).some((c) => !c.cotizacion_id)) {
    return rechazo(409, 'clientes_distintos', 'Las cuentas de una misma operación deben ser de un solo cliente.')
  }
  const clienteId = (cotizaciones ?? [])[0].cliente_id as string | null
  if (!clienteId) return { ok: true, contraparte: { id: null, nombre: ((cotizaciones ?? [])[0].cliente as string | null) ?? 'Cliente', rfc: null } }
  const { data: cliente, error: errorCliente } = await supabaseAdmin.from('clientes').select('id, nombre, rfc').eq('id', clienteId).maybeSingle()
  if (errorCliente) throw errorCliente
  if (!cliente) return rechazo(404, 'contraparte_no_encontrada', 'Cliente no encontrado.')
  return { ok: true, contraparte: { id: cliente.id as string, nombre: cliente.nombre as string, rfc: (cliente.rfc as string | null) ?? null } }
}

/** #131: contrapartes con algo pendiente (`cuentas_contrapartes_pendientes`, SQL decide); `q` filtra por nombre, hasta 50 filas. */
export async function cargarContrapartesPendientes(lado: LadoCuentas, pendiente: PendienteContraparte, q?: string): Promise<ContrapartesPendientes> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_contrapartes_pendientes', { p_lado: lado, p_pendiente: pendiente, p_q: q ?? null, p_limit: 50 })
  if (error) throw error
  return data as ContrapartesPendientes
}
