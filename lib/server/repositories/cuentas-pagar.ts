import { supabaseAdmin } from '@/lib/supabase'
import {
  CuentaPagar,
  DocumentoCuentaPagar,
  ItemCotizacion,
  OrdenPago,
  Proyecto,
} from '@/lib/types'
import { getItemsByCotizacion } from '@/lib/server/repositories/quotations'

async function hydrateProyectoNombre(cuentas: CuentaPagar[]) {
  if (cuentas.length === 0) return cuentas

  const cotizacionIds = Array.from(new Set(cuentas.map((cuenta) => cuenta.cotizacion_id).filter(Boolean)))
  const proyectoIds = Array.from(new Set(cuentas.map((cuenta) => cuenta.proyecto_id).filter(Boolean)))

  const proyectoPorCotizacion: Record<string, string> = {}
  const proyectoPorId: Record<string, string> = {}

  if (cotizacionIds.length > 0) {
    const { data: cotizaciones, error: cotizacionesError } = await supabaseAdmin
      .from('cotizaciones')
      .select('id, proyecto')
      .in('id', cotizacionIds)

    if (cotizacionesError) throw cotizacionesError

    for (const cotizacion of cotizaciones || []) {
      proyectoPorCotizacion[cotizacion.id] = cotizacion.proyecto
    }
  }

  if (proyectoIds.length > 0) {
    const { data: proyectos, error: proyectosError } = await supabaseAdmin
      .from('proyectos')
      .select('id, proyecto')
      .in('id', proyectoIds)

    if (proyectosError) throw proyectosError

    for (const proyecto of proyectos || []) {
      proyectoPorId[proyecto.id] = proyecto.proyecto
    }
  }

  return cuentas.map((cuenta) => ({
    ...cuenta,
    proyecto_nombre:
      cuenta.proyecto_nombre ||
      proyectoPorCotizacion[cuenta.cotizacion_id] ||
      proyectoPorId[cuenta.proyecto_id] ||
      undefined,
  }))
}

export async function getCuentasPagar() {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const cuentas = (data || []) as CuentaPagar[]
  return hydrateProyectoNombre(cuentas)
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

export async function updateCuentasPagarEnOrden(ids: string[], ordenId: string) {
  const { error } = await supabaseAdmin
    .from('cuentas_pagar')
    .update({ estado: 'EN_PROCESO_PAGO', orden_pago_id: ordenId })
    .in('id', ids)
  if (error) throw error
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
    const { data: responsables, error: responsablesError } = await supabaseAdmin
      .from('responsables')
      .select('id, nombre')

    if (responsablesError) throw responsablesError

    responsableIdPorNombre = new Map(
      (responsables || [])
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
  return data.filter((cuenta: any) => {
    const fechaEntrega = cuenta.cotizaciones?.fecha_entrega
    return fechaEntrega && fechaEntrega <= hoy
  }) as any[]
}
