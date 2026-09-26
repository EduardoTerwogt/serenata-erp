/**
 * Rediseño de Cuentas B5 (U2): carga de la BD del detalle de un concepto.
 * El armado (y la derivación) vive en detalle-armar.ts, puro.
 */
import { cuentasReabiertas } from '@/lib/server/repositories/proyectos'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { DetalleCobro, DetallePago, ProyectoDetalleCorto } from '@/lib/shared/cuentas/detalle-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import type { RegimenFiscal } from '@/lib/types'
import { armarDetalleCobro, armarDetallePago, type DocumentoFila, type PagoFilas } from './detalle-armar'

const COLS_DOC = 'id, tipo, archivo_url, archivo_nombre, fecha_carga, estado_validacion, detalle_validacion, eliminado_at, eliminado_motivo'

async function proyectoCorto(id: string | null): Promise<ProyectoDetalleCorto | null> {
  if (!id) return null
  const { data, error } = await supabaseAdmin.from('proyectos').select('id, proyecto, fecha_entrega').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const fecha = typeof data.fecha_entrega === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha_entrega) ? data.fecha_entrega : null
  return { id: data.id, nombre: data.proyecto ?? data.id, fecha_entrega: fecha }
}

export async function cargarDetalleCobro(id: string): Promise<DetalleCobro | null> {
  const { data: cuenta, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('id, folio, cotizacion_id, cliente, monto_total, monto_pagado, fecha_factura, fecha_vencimiento, notas, proyecto_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!cuenta) return null

  const [proyecto, docs, pagos, abierta] = await Promise.all([
    proyectoCorto(cuenta.proyecto_id),
    supabaseAdmin.from('documentos_cuentas_cobrar').select(`${COLS_DOC}, metodo_pago_cfdi, pago_id`).eq('cuentas_cobrar_id', id),
    supabaseAdmin
      .from('pagos_comprobantes')
      .select('id, monto, tipo_pago, fecha_pago, comprobante_url, notas, created_at, anulado_at, anulado_motivo')
      .eq('cuentas_cobrar_id', id),
    cuentasReabiertas(cuenta.proyecto_id),
  ])
  if (docs.error) throw docs.error
  if (pagos.error) throw pagos.error

  return armarDetalleCobro(
    { cuenta, proyecto, documentos: (docs.data ?? []) as DocumentoFila[], pagos: pagos.data ?? [], reabierta: abierta },
    hoyCdmx()
  )
}

const COLS_CUENTA_PAGAR =
  'id, item_id, cotizacion_id, item_descripcion, cantidad, x_pagar, monto_pagado, responsable_id, responsable_nombre, correo, telefono, banco, clabe, proyecto_id, estado, grupo_id, total_a_transferir, monto_transferido, orden_pago_id'

/** Detalle de un grupo de facturación o de una cuenta suelta. */
export async function cargarDetallePago(objetivo: 'grupo' | 'cuenta', id: string): Promise<DetallePago | null> {
  let destino: PagoFilas['destino']
  let cuentas: PagoFilas['cuentas']

  if (objetivo === 'grupo') {
    const { data: g, error } = await supabaseAdmin
      .from('cuentas_pagar_grupos')
      .select('id, proyecto_id, responsable_id, estado, monto_total, total_a_transferir, monto_transferido, orden_pago_id')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!g) return null
    const hijas = await supabaseAdmin.from('cuentas_pagar').select(COLS_CUENTA_PAGAR).eq('grupo_id', id).order('created_at').order('id')
    if (hijas.error) throw hijas.error
    destino = { ...g, neto: Number(g.monto_total) }
    cuentas = hijas.data ?? []
  } else {
    const { data: c, error } = await supabaseAdmin.from('cuentas_pagar').select(COLS_CUENTA_PAGAR).eq('id', id).maybeSingle()
    if (error) throw error
    if (!c) return null
    // Una cuenta dentro de un grupo se paga y se documenta en el grupo.
    if (c.grupo_id) return cargarDetallePago('grupo', c.grupo_id)
    destino = {
      id: c.id,
      proyecto_id: c.proyecto_id,
      responsable_id: c.responsable_id,
      estado: c.estado,
      neto: Number(c.x_pagar),
      total_a_transferir: c.total_a_transferir,
      monto_transferido: c.monto_transferido,
      orden_pago_id: c.orden_pago_id,
    }
    cuentas = [c]
  }

  const filtroDocs = objetivo === 'grupo' ? { col: 'grupo_id', val: id } : { col: 'cuentas_pagar_id', val: id }
  const filtroPagos = objetivo === 'grupo' ? { col: 'grupo_id', val: id } : { col: 'cuenta_pagar_id', val: id }
  const [proyecto, docs, pagos, proveedor, orden, abierta] = await Promise.all([
    proyectoCorto(destino.proyecto_id),
    supabaseAdmin.from('documentos_cuentas_pagar').select(COLS_DOC).eq(filtroDocs.col, filtroDocs.val),
    supabaseAdmin
      .from('pagos_cuentas_pagar')
      .select('id, fecha_pago, tipo_pago, monto_transferido, comprobante_url, notas, estimado, created_at, anulado_at, anulado_motivo')
      .eq(filtroPagos.col, filtroPagos.val),
    destino.responsable_id
      ? supabaseAdmin.from('proveedores').select('id, nombre, regimen_fiscal, correo, telefono, banco, clabe').eq('id', destino.responsable_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    destino.orden_pago_id
      ? supabaseAdmin.from('ordenes_pago').select('id, pdf_nombre, pdf_url, estado, fecha_generacion').eq('id', destino.orden_pago_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    cuentasReabiertas(destino.proyecto_id),
  ])
  for (const r of [docs, pagos, proveedor, orden]) if (r.error) throw r.error

  return armarDetallePago({
    objetivo,
    destino,
    cuentas,
    proveedor: proveedor.data ? { ...proveedor.data, regimen_fiscal: (proveedor.data.regimen_fiscal as RegimenFiscal | null) ?? null } : null,
    proyecto,
    documentos: (docs.data ?? []) as DocumentoFila[],
    pagos: pagos.data ?? [],
    orden: orden.data,
    reabierta: abierta,
  })
}
