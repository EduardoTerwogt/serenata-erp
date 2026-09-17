import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  CuentaPagar,
  CuentaPagarGrupo,
  DocumentoCuentaPagar,
  ItemCotizacion,
  OrdenPago,
  Proyecto,
} from '@/lib/types'
import { getItemsByCotizacion } from '@/lib/server/repositories/quotations'

export type CuentaPagarConJoins = CuentaPagar & {
  cotizaciones?: { proyecto?: string; fecha_entrega?: string } | null
  proyectos?: { proyecto?: string } | null
}

type CuentaPagarGrupoConJoins = CuentaPagarGrupo & {
  proyectos?: { proyecto?: string } | null
  proveedores?: { nombre?: string } | null
}

export async function getCuentasPagar() {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*, cotizaciones(proyecto), proyectos(proyecto)')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return ((data || []) as CuentaPagarConJoins[]).map((row) => ({
    ...row,
    proyecto_nombre:
      row.proyecto_nombre ||
      row.cotizaciones?.proyecto ||
      row.proyectos?.proyecto ||
      undefined,
    cotizaciones: undefined,
    proyectos: undefined,
  })) as CuentaPagar[]
}

export interface BuscarCuentasPagarResult {
  rows: CuentaPagar[]
  total_rows: number
  total_monto_pendiente: number
  total_monto_pagado: number
  pendientes_count: number
}

/**
 * EF-3 3B-3: busqueda/paginacion/totales server-side via RPC unica
 * (db/migrations/20260914_buscar_cuentas_pagar.sql) -- reemplaza el
 * filtrado en JS sobre getCuentasPagar() (que además trae solo las
 * últimas 500 filas).
 */
export async function buscarCuentasPagar(search: string | null, page: number, pageSize: number) {
  const { data, error } = await supabaseAdmin.rpc('buscar_cuentas_pagar', {
    p_search: search,
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) throw error
  return data as BuscarCuentasPagarResult
}

/**
 * Detalle por ID -- nunca a través de getCuentasPagar().find(), que con
 * más de 500 cuentas puede no traer la fila buscada aunque exista (1C-1).
 * .maybeSingle() nunca .single(): "no encontrada" debe seguir siendo un
 * 404 explícito del caller, no un error de Postgres por 0 filas.
 */
export async function getCuentaPagarById(id: string): Promise<CuentaPagar | null> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*, cotizaciones(proyecto), proyectos(proyecto)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as CuentaPagarConJoins
  return {
    ...row,
    proyecto_nombre:
      row.proyecto_nombre ||
      row.cotizaciones?.proyecto ||
      row.proyectos?.proyecto ||
      undefined,
    cotizaciones: undefined,
    proyectos: undefined,
  } as CuentaPagar
}

/**
 * Cuentas por pagar de un proyecto puntual -- usado por el auto-llenado del
 * Status Report / Reporte de Cierre (Fase 5.2) para financiero real vs.
 * cotizado, sin traer las 500 más recientes de todo el sistema.
 */
export async function getCuentasPagarByProyecto(proyectoId: string): Promise<CuentaPagar[]> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*')
    .eq('proyecto_id', proyectoId)
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

export async function generarHistorialProyecto(proyectoId: string, proyecto: Proyecto) {
  const cotizacionIds: string[] = [proyectoId]

  const { data: complementarias } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('es_complementaria_de', proyectoId)
    .eq('estado', 'APROBADA')

  if (complementarias) {
    cotizacionIds.push(...complementarias.map((c: { id: string }) => c.id))
  }

  const allItemArrays = await Promise.all(cotizacionIds.map(cid => getItemsByCotizacion(cid)))
  const allItems = allItemArrays.flat()

  const normalizeResponsableName = (value: string | null | undefined) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  const normalizeRole = (value: string | null | undefined) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  const itemsConAlgunaReferencia = allItems.filter(item => !!item.responsable_id || !!item.responsable_nombre)

  let responsableIdPorNombre = new Map<string, string>()
  const hayItemsSinId = itemsConAlgunaReferencia.some(item => !item.responsable_id && item.responsable_nombre)

  if (hayItemsSinId) {
    const { data: proveedores, error: proveedoresError } = await supabaseAdmin
      .from('proveedores')
      .select('id, nombre')

    if (proveedoresError) throw proveedoresError

    responsableIdPorNombre = new Map(
      (proveedores || [])
        .filter((responsable: { id: string | null; nombre: string | null }) => !!responsable.id && !!responsable.nombre)
        .map((responsable: { id: string; nombre: string }) => [normalizeResponsableName(responsable.nombre), responsable.id])
    )
  }

  const { error: delError } = await supabaseAdmin
    .from('historial_responsable')
    .delete()
    .eq('proyecto_id', proyectoId)

  if (delError) throw delError

  const rowsMap = new Map<string, {
    responsable_id: string
    cotizacion_id: string
    proyecto_id: string
    proyecto_nombre: string
    cliente: string
    fecha_evento: string | null
    rol_en_proyecto: string | null
    x_pagar: number
  }>()

  for (const item of itemsConAlgunaReferencia) {
    const resolvedResponsableId =
      item.responsable_id ||
      responsableIdPorNombre.get(normalizeResponsableName(item.responsable_nombre)) ||
      null

    if (!resolvedResponsableId) continue

    const role = item.descripcion || item.categoria || null
    const key = `${resolvedResponsableId}__${normalizeRole(role)}`
    const existing = rowsMap.get(key)

    if (existing) {
      existing.x_pagar += item.x_pagar || 0
      continue
    }

    rowsMap.set(key, {
      responsable_id: resolvedResponsableId,
      cotizacion_id: item.cotizacion_id,
      proyecto_id: proyectoId,
      proyecto_nombre: proyecto.proyecto,
      cliente: proyecto.cliente,
      fecha_evento: proyecto.fecha_entrega || null,
      rol_en_proyecto: role,
      x_pagar: item.x_pagar || 0,
    })
  }

  const rows = Array.from(rowsMap.values())

  if (rows.length === 0) return 0

  const { error: insError } = await supabaseAdmin
    .from('historial_responsable')
    .insert(rows)

  if (insError) throw insError

  return rows.length
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

export async function updateDocumentoCuentaPagar(id: string, updates: Partial<DocumentoCuentaPagar>) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as DocumentoCuentaPagar
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

export interface BuscarOrdenesPagoResult {
  rows: OrdenPago[]
  totalRows: number
}

// EF-3 3B-11: getOrdenesPago() sin limite explicito -- unico consumidor
// (ordenes-historial/route.ts) pasa a pedir paginado vía la RPC
// buscar_ordenes_pago (db/migrations/20260914_buscar_ordenes_pago.sql).
// getOrdenesPago() se conserva sin cambios -- ningun otro caller la usa
// hoy, pero no hay razón para eliminarla si no estorba.
export async function buscarOrdenesPago(page: number, pageSize: number): Promise<BuscarOrdenesPagoResult> {
  const { data, error } = await supabaseAdmin.rpc('buscar_ordenes_pago', {
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) throw error
  return { rows: data.rows as OrdenPago[], totalRows: data.total_rows as number }
}

// ==================== Agrupación de Cuentas por Pagar (docs/PLAN.md) ====================

export async function getCuentaPagarGrupoById(id: string): Promise<CuentaPagarGrupo | null> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar_grupos')
    .select('*, proyectos(proyecto), proveedores(nombre)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as CuentaPagarGrupoConJoins
  return {
    ...row,
    proyecto_nombre: row.proyecto_nombre || row.proyectos?.proyecto || undefined,
    responsable_nombre: row.proveedores?.nombre || undefined,
    proyectos: undefined,
    proveedores: undefined,
  } as CuentaPagarGrupo
}

export async function getCuentasPagarPorGrupo(grupoId: string): Promise<CuentaPagar[]> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*')
    .eq('grupo_id', grupoId)
  if (error) throw error
  return data as CuentaPagar[]
}

/**
 * Transición ABIERTO -> FACTURADO. El guard `.eq('estado', 'ABIERTO')` vive
 * en el propio UPDATE -- atómico por construcción (una sola sentencia SQL),
 * sin necesitar una RPC dedicada. Si el grupo ya no estaba ABIERTO (carrera
 * con otra subida, o ya facturado), no actualiza nada y devuelve null --
 * el caller decide qué hacer con eso.
 */
export async function marcarGrupoFacturado(id: string): Promise<CuentaPagarGrupo | null> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar_grupos')
    .update({ estado: 'FACTURADO', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'ABIERTO')
    .select()
  if (error) throw error
  return data && data.length > 0 ? (data[0] as CuentaPagarGrupo) : null
}

export async function getDocumentosCuentaPagarGrupo(grupoId: string) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .select('*')
    .eq('grupo_id', grupoId)
    .order('fecha_carga', { ascending: false })
  if (error) throw error
  return data as DocumentoCuentaPagar[]
}

/**
 * Fuente de generar-orden-pago desde el Bloque 3: grupos FACTURADO cuyas
 * cotizaciones (principal + cualquier complementaria) ya tienen evento
 * realizado -- ver db/migrations/20260917_orden_pago_grupos_facturados_eventos_realizados.sql.
 * Mismo shape que getCuentasPagarPendientesEventosRealizados(), así que
 * buildOrdenPagoPreview() sigue funcionando sin cambios.
 */
export async function getCuentasPagarGruposFacturadosEventosRealizados() {
  const { data, error } = await supabaseAdmin.rpc('cuentas_pagar_grupos_facturados_eventos_realizados')
  if (error) throw error
  return data as CuentaPagarConJoins[]
}

export async function updateCuentasPagarGruposEnOrden(grupoIds: string[], ordenId: string) {
  const { error: grupoError } = await supabaseAdmin
    .from('cuentas_pagar_grupos')
    .update({ estado: 'EN_PROCESO_PAGO', orden_pago_id: ordenId })
    .in('id', grupoIds)
  if (grupoError) throw grupoError

  // Se refleja en las hijas para no romper reportes existentes que ya leen
  // cuentas_pagar.orden_pago_id/estado a nivel item (y para que la
  // agregación de ordenes_pago.estado dentro de registrar_pago_grupo_factura,
  // que sigue leyendo por cuentas_pagar.orden_pago_id, no cambie).
  const { error: cuentasError } = await supabaseAdmin
    .from('cuentas_pagar')
    .update({ estado: 'EN_PROCESO_PAGO', orden_pago_id: ordenId })
    .in('grupo_id', grupoIds)
  if (cuentasError) throw cuentasError
}
