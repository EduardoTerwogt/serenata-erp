/**
 * Rediseño de Cuentas B5 (U2) / B6: carga de la BD del detalle de un concepto. Estado, paso,
 * saldo, vencimiento, complementos y cruce fiscal los deriva SQL (`cuentas_conceptos` con ese
 * concepto, las mismas reglas de la lista); el armado de las filas vive en detalle-armar.ts, puro.
 */
import { cuentasReabiertas } from '@/lib/server/repositories/proyectos'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { DetalleCobro, DetallePago, ProyectoDetalleCorto } from '@/lib/shared/cuentas/detalle-tipos'
import { hoyCdmx } from '@/lib/shared/hoy-cdmx'
import type { RegimenFiscal } from '@/lib/types'
import { armarDetalleCobro, armarDetallePago, type DerivadoCobro, type DerivadoPago, type DocumentoFila, type PagoFilas } from './detalle-armar'
import { conceptoDerivadoDesdeSql, type FilaConceptoSql } from './periodo-sql'

const COLS_DOC = 'id, tipo, archivo_url, archivo_nombre, fecha_carga, estado_validacion, detalle_validacion, eliminado_at, eliminado_motivo'

type LineaCobroFila = {
  monto: number
  pago_id: string
  pagos: { fecha_pago: string; tipo_pago: string; comprobante_url: string | null; notas: string | null; created_at: string; anulado_at: string | null; anulado_motivo: string | null }
}
type LineaProveedorFila = {
  monto_transferido: number
  monto_neto: number
  estimado: boolean
  pago_id: string
  pagos: { fecha_pago: string; tipo_pago: string; comprobante_url: string | null; notas: string | null; created_at: string; anulado_at: string | null; anulado_motivo: string | null }
}

/** Cuántas líneas tiene cada pago (>1 = pago compartido, P20). */
async function lineasPorPago(tabla: 'pagos_comprobantes' | 'pagos_cuentas_pagar', pagoIds: string[]): Promise<Map<string, number>> {
  const cuenta = new Map<string, number>()
  if (pagoIds.length === 0) return cuenta
  const { data, error } = await supabaseAdmin.from(tabla).select('pago_id').in('pago_id', pagoIds)
  if (error) throw error
  for (const l of (data ?? []) as { pago_id: string }[]) cuenta.set(l.pago_id, (cuenta.get(l.pago_id) ?? 0) + 1)
  return cuenta
}

/**
 * Documentos dados de baja de un cobro que ya no cuelgan de él (el historial vive en `cuentas_correcciones`,
 * P27: la factura dada de baja deja de estar ligada a la cuenta y su XML no lleva ancla de cuenta).
 */
async function bajasDeCobro(cuentaId: string, yaCargados: Set<string>): Promise<DocumentoFila[]> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_correcciones')
    .select('detalle')
    .eq('objetivo', 'cobro')
    .eq('objetivo_id', cuentaId)
    .in('tipo', ['quitar_documento', 'reemplazar_documento'])
  if (error) throw error
  const ids = Array.from(new Set(((data ?? []) as { detalle: { documento_id?: string } | null }[]).map((c) => c.detalle?.documento_id).filter((x): x is string => Boolean(x) && !yaCargados.has(x as string))))
  if (ids.length === 0) return []
  const docs = await supabaseAdmin.from('documentos_cuentas_cobrar').select(`${COLS_DOC}, metodo_pago_cfdi, pago_id`).in('id', ids).not('eliminado_at', 'is', null)
  if (docs.error) throw docs.error
  return (docs.data ?? []) as DocumentoFila[]
}

async function proyectoCorto(id: string | null): Promise<ProyectoDetalleCorto | null> {
  if (!id) return null
  const { data, error } = await supabaseAdmin.from('proyectos').select('id, proyecto, fecha_entrega').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const fecha = typeof data.fecha_entrega === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.fecha_entrega) ? data.fecha_entrega : null
  return { id: data.id, nombre: data.proyecto ?? data.id, fecha_entrega: fecha }
}

/** El concepto, derivado por SQL con las mismas reglas que la lista; null si no existe. */
async function filaDerivada(objetivo: 'cobro' | 'grupo' | 'cuenta', id: string): Promise<FilaConceptoSql> {
  const { data, error } = await supabaseAdmin.rpc('cuentas_conceptos', { p_year: null, p_hoy: hoyCdmx(), p_objetivo: objetivo, p_id: id })
  if (error) throw error
  const fila = ((data ?? []) as FilaConceptoSql[])[0]
  if (!fila) throw new Error(`cuentas_conceptos no devolvió el concepto ${objetivo} ${id}`)
  return fila
}

const aDerivadoCobro = (fila: FilaConceptoSql): DerivadoCobro => ({ concepto: conceptoDerivadoDesdeSql(fila) })

const aDerivadoPago = (fila: FilaConceptoSql): DerivadoPago => ({
  concepto: conceptoDerivadoDesdeSql(fila),
  total: fila.total,
  total_estimado: fila.total_estimado,
  pagado: fila.pagado,
  cruce: { neto: fila.neto, iva: Number(fila.cierre_iva), iva_retenido: Number(fila.cierre_iva_retenido), isr_retenido: Number(fila.cierre_isr_retenido) },
})

export async function cargarDetalleCobro(id: string): Promise<DetalleCobro | null> {
  const { data: cuenta, error } = await supabaseAdmin
    .from('cuentas_cobrar')
    .select('id, folio, cotizacion_id, monto_total, monto_pagado, fecha_factura, fecha_vencimiento, notas, proyecto_id, factura_documento_id, cotizaciones(cliente, cliente_id, clientes(nombre))')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!cuenta) return null

  const facturaId = (cuenta as { factura_documento_id?: string | null }).factura_documento_id ?? null
  const [proyecto, docs, pagos, abierta, derivada, facturaCuentas] = await Promise.all([
    proyectoCorto(cuenta.proyecto_id),
    // #123 (P27): la factura (FACTURA_XML, sin ancla de cuenta), sus PDF y complementos, y lo anclado a la cuenta.
    supabaseAdmin
      .from('documentos_cuentas_cobrar')
      .select(`${COLS_DOC}, metodo_pago_cfdi, pago_id`)
      .or(facturaId ? `cuentas_cobrar_id.eq.${id},factura_documento_id.eq.${facturaId},id.eq.${facturaId}` : `cuentas_cobrar_id.eq.${id}`),
    // #123: la fecha, el tipo, el comprobante y la anulación viven en la cabecera `pagos`.
    supabaseAdmin
      .from('pagos_comprobantes')
      .select('monto, pago_id, pagos!inner(fecha_pago, tipo_pago, comprobante_url, notas, created_at, anulado_at, anulado_motivo)')
      .eq('cuentas_cobrar_id', id),
    cuentasReabiertas(cuenta.proyecto_id),
    filaDerivada('cobro', id),
    facturaId ? supabaseAdmin.from('cuentas_cobrar').select('id', { count: 'exact', head: true }).eq('factura_documento_id', facturaId) : Promise.resolve({ count: 0, error: null }),
  ])
  if (docs.error) throw docs.error
  if (pagos.error) throw pagos.error
  if (facturaCuentas.error) throw facturaCuentas.error
  const documentos = [...((docs.data ?? []) as DocumentoFila[])]
  documentos.push(...(await bajasDeCobro(id, new Set(documentos.map((d) => d.id)))))
  const lineasCobro = (pagos.data ?? []) as unknown as LineaCobroFila[]
  const lineas = await lineasPorPago('pagos_comprobantes', Array.from(new Set(lineasCobro.map((l) => l.pago_id))))

  // D12: el cliente sale de la cotización del cobro (clientes.nombre; lo emitido como respaldo).
  const { cotizaciones, ...cuentaBase } = cuenta as typeof cuenta & {
    cotizaciones: { cliente: string | null; cliente_id: string | null; clientes: { nombre: string | null } | null } | null
  }
  const cliente = cotizaciones?.clientes?.nombre ?? cotizaciones?.cliente ?? null

  return armarDetalleCobro(
    {
      cuenta: { ...cuentaBase, cliente, cliente_id: cotizaciones?.cliente_id ?? null },
      proyecto,
      documentos,
      pagos: lineasCobro.map((l) => ({ id: l.pago_id, monto: l.monto, ...l.pagos, lineas: lineas.get(l.pago_id) ?? 1 })),
      facturaCuentas: facturaCuentas.count ?? 0,
      reabierta: abierta,
    },
    aDerivadoCobro(derivada)
  )
}

// Descripción y cantidad salen del renglón (dueño) por su llave; la FK simple
// desambigua el embed frente a la compuesta (item_id, cotizacion_id).
const COLS_CUENTA_PAGAR =
  'id, item_id, cotizacion_id, costo_total, monto_pagado, responsable_id, proyecto_id, estado, grupo_id, items_cotizacion!cuentas_pagar_item_id_fkey(descripcion, cantidad)'

type FilaCuentaPagar = {
  id: string
  item_id: string
  cotizacion_id: string | null
  costo_total: number
  monto_pagado: number | null
  items_cotizacion: { descripcion: string | null; cantidad: number | null } | null
}

function aFilaCuenta(c: FilaCuentaPagar): PagoFilas['cuentas'][number] {
  return {
    id: c.id,
    item_id: c.item_id,
    cotizacion_id: c.cotizacion_id,
    item_descripcion: c.items_cotizacion?.descripcion ?? null,
    cantidad: c.items_cotizacion?.cantidad ?? null,
    costo_total: c.costo_total,
    monto_pagado: c.monto_pagado,
  }
}

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
    cuentas = ((hijas.data ?? []) as unknown as FilaCuentaPagar[]).map(aFilaCuenta)
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
      neto: Number(c.costo_total),
      // B5a: una cuenta suelta no tiene factura, pago ni orden propios.
      total_a_transferir: null,
      monto_transferido: 0,
      orden_pago_id: null,
    }
    cuentas = [aFilaCuenta(c as unknown as FilaCuentaPagar)]
  }

  const filtroDocs = objetivo === 'grupo' ? { col: 'grupo_id', val: id } : { col: 'cuentas_pagar_id', val: id }
  const [proyecto, docs, pagos, proveedor, orden, abierta, derivada] = await Promise.all([
    proyectoCorto(destino.proyecto_id),
    supabaseAdmin.from('documentos_cuentas_pagar').select(`${COLS_DOC}, metodo_pago_cfdi, pago_id`).eq(filtroDocs.col, filtroDocs.val),
    // #123: una cuenta suelta no tiene pagos (B5a); los de un grupo salen de sus líneas con los datos de la cabecera `pagos`.
    objetivo === 'grupo'
      ? supabaseAdmin
          .from('pagos_cuentas_pagar')
          .select('monto_transferido, monto_neto, estimado, pago_id, pagos!inner(fecha_pago, tipo_pago, comprobante_url, notas, created_at, anulado_at, anulado_motivo)')
          .eq('grupo_id', id)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    destino.responsable_id
      ? supabaseAdmin.from('proveedores').select('id, nombre, regimen_fiscal, correo, telefono, banco, clabe').eq('id', destino.responsable_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    destino.orden_pago_id
      ? supabaseAdmin.from('ordenes_pago').select('id, pdf_nombre, pdf_url, estado, fecha_generacion').eq('id', destino.orden_pago_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    cuentasReabiertas(destino.proyecto_id),
    filaDerivada(objetivo, id),
  ])
  for (const r of [docs, pagos, proveedor, orden]) if (r.error) throw r.error
  const lineasProveedor = (pagos.data ?? []) as unknown as LineaProveedorFila[]
  const lineas = await lineasPorPago('pagos_cuentas_pagar', Array.from(new Set(lineasProveedor.map((l) => l.pago_id))))

  return armarDetallePago({
    objetivo,
    destino,
    cuentas,
    proveedor: proveedor.data ? { ...proveedor.data, regimen_fiscal: (proveedor.data.regimen_fiscal as RegimenFiscal | null) ?? null } : null,
    proyecto,
    documentos: (docs.data ?? []) as DocumentoFila[],
    pagos: lineasProveedor.map((l) => ({ id: l.pago_id, monto_transferido: l.monto_transferido, estimado: l.estimado, ...l.pagos, lineas: lineas.get(l.pago_id) ?? 1 })),
    orden: orden.data,
    reabierta: abierta,
  }, aDerivadoPago(derivada))
}
