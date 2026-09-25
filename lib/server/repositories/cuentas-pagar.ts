import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  CuentaPagar,
  CuentaPagarGrupo,
  DocumentoCuentaPagar,
  ItemCotizacion,
  Proyecto,
} from '@/lib/types'
import { getItemsByCotizacion } from '@/lib/server/repositories/quotations'
import { DomainError } from '@/lib/server/errors/domain-error'

type CuentaPagarConJoins = CuentaPagar & {
  cotizaciones?: { proyecto?: string } | null
  proyectos?: { proyecto?: string } | null
}

type CuentaPagarGrupoConJoins = CuentaPagarGrupo & {
  proyectos?: { proyecto?: string } | null
  proveedores?: { nombre?: string } | null
}

export interface BuscarCuentasPagarResult {
  rows: CuentaPagar[]
  total_rows: number
  total_monto_pendiente: number
  total_monto_pagado: number
  pendientes_count: number
}

/**
 * Bloque 6 (docs/PLAN.md, agrupación de Cuentas por Pagar): fuente de la
 * vista "Lista" via RPC unica buscar_cuentas_pagar_grupos
 * (db/migrations/20260918_buscar_cuentas_pagar_grupos.sql) -- reemplaza a
 * buscar_cuentas_pagar (db/migrations/20260914_buscar_cuentas_pagar.sql,
 * se deja desplegada sin caller, mismo patrón de limpieza que
 * getCuentasPagarPendientesEventosRealizados del Bloque 3). Cada fila es un
 * grupo real (cuentas_pagar_grupos, con estado/x_pagar/monto_pagado del
 * grupo) o una cuenta_pagar legacy sin grupo_id -- nunca items sueltos de un
 * grupo ya existente.
 */
export async function buscarCuentasPagarGrupos(search: string | null, page: number, pageSize: number) {
  const { data, error } = await supabaseAdmin.rpc('buscar_cuentas_pagar_grupos', {
    p_search: search,
    p_page: page,
    p_page_size: pageSize,
  })
  if (error) throw error
  return data as BuscarCuentasPagarResult
}

/**
 * Detalle por ID (1C-1).
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

    // Bloque 3 (docs/PLAN.md): x_pagar es el Costo Unitario -- el monto real
    // pagado al responsable por esta partida es x_pagar * cantidad (Costo
    // Total), no el unitario suelto. Hallazgo propio de la auditoría
    // semántica de cierre del bloque: generarHistorialProyecto alimenta
    // "Total acumulado" en el historial de Proveedores (ProveedorModal.tsx)
    // y tenía este mismo bug, sin estar en la lista original del plan.
    const costoTotalItem = (item.x_pagar || 0) * (item.cantidad || 0)

    if (existing) {
      existing.x_pagar += costoTotalItem
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
      x_pagar: costoTotalItem,
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
    // B7: un documento dado de baja nunca es vigente (T7).
    .is('eliminado_at', null)
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

export async function getDocumentosCuentaPagarGrupo(grupoId: string) {
  const { data, error } = await supabaseAdmin
    .from('documentos_cuentas_pagar')
    .select('*')
    .eq('grupo_id', grupoId)
    // B7: un documento dado de baja nunca es vigente (T7).
    .is('eliminado_at', null)
    .order('fecha_carga', { ascending: false })
  if (error) throw error
  return data as DocumentoCuentaPagar[]
}

export interface OrdenPagoCandidato {
  tipo: 'grupo' | 'cuenta'
  id: string
  /** Saldo neto que la ruta imprimió en el PDF; la RPC lo revalida. */
  monto_esperado: number
}

export interface GenerarOrdenPagoResult {
  orden_pago_id: string
  total_monto: number
  grupos: number
  cuentas: number
}

/**
 * Rediseño de Cuentas B1b (docs/PLAN.md, H1, H2, S1, S2): crea la orden, su
 * desglose inmutable (`ordenes_pago_conceptos`) y marca grupos, hijas y
 * sueltas en una sola transacción, con los candidatos bloqueados y
 * revalidados -- db/migrations/20260925_ordenes_pago_generar_atomico.sql.
 * Los errores esperados de la RPC (ERRCODE P1414) salen como DomainError
 * con un mensaje seguro; cualquier otro se propaga tal cual.
 */
export async function generarOrdenPago(params: {
  candidatos: OrdenPagoCandidato[]
  pdfUrl: string | null
  pdfNombre: string
  usuario: string
}): Promise<GenerarOrdenPagoResult> {
  const { data, error } = await supabaseAdmin.rpc('generar_orden_pago', {
    p_candidatos: params.candidatos,
    p_pdf_url: params.pdfUrl,
    p_pdf_nombre: params.pdfNombre,
    p_usuario: params.usuario,
  })
  if (error) {
    const message = error.message ?? ''
    if (error.code === 'P1414' && message.startsWith('candidatos_cambiaron')) {
      throw new DomainError({
        code: 'candidatos_cambiaron',
        status: 409,
        safeMessage: 'Los saldos cambiaron mientras se generaba la orden. Vuelve a cargar la vista previa e inténtalo de nuevo.',
        cause: error,
      })
    }
    if (error.code === 'P1414' && message.startsWith('candidato_no_elegible')) {
      throw new DomainError({
        code: 'candidato_no_elegible',
        status: 409,
        safeMessage: 'Alguna cuenta ya no se puede incluir (entró a otra orden o cambió de estado). Vuelve a cargar la vista previa.',
        cause: error,
      })
    }
    throw error
  }
  return data as GenerarOrdenPagoResult
}

export interface ValidarFacturaProveedorResult {
  documento_id: string
  grupo_id: string | null
  cuenta_pagar_id: string | null
  total_a_transferir: number
  estado: string
}

/**
 * Rediseño de Cuentas B2 (docs/PLAN.md, T4, V3, A2): ÚNICA vía para dejar
 * una factura XML de proveedor en 'validado'. En la misma transacción guarda
 * el snapshot del total a transferir y, si es un grupo ABIERTO, lo pasa a
 * FACTURADO -- db/migrations/20260927_cuentas_b2_pagos_total_a_transferir.sql.
 * Reemplaza a marcarGrupoFacturado. Si falla, el documento se queda como
 * estaba ('pendiente' = "En revisión"), nunca validado sin snapshot.
 */
export async function validarFacturaProveedor(documentoId: string, usuario: string | null): Promise<ValidarFacturaProveedorResult> {
  const { data, error } = await supabaseAdmin.rpc('validar_factura_proveedor', {
    p_documento_id: documentoId,
    p_usuario: usuario,
  })
  if (error) {
    if (error.code === 'P1415') {
      throw new DomainError({
        code: (error.message ?? '').startsWith('sin_total_cfdi') ? 'sin_total_cfdi' : 'factura_invalida',
        status: 409,
        safeMessage: (error.message ?? '').startsWith('sin_total_cfdi')
          ? 'La factura no tiene el total del CFDI guardado; vuelve a subir el XML para validarla.'
          : 'El documento no es una factura XML de proveedor.',
        cause: error,
      })
    }
    throw error
  }
  return data as ValidarFacturaProveedorResult
}
