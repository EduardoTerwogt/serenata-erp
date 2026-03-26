import { supabaseAdmin } from '@/lib/supabase'
import { Cotizacion, CuentaCobrar, CuentaPagar, ItemCotizacion, Proyecto, Responsable } from '@/lib/types'

// ==================== COTIZACIONES ====================

export async function getCotizaciones() {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Cotizacion[]
}

export async function getCotizacionById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('*, items_cotizacion(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  // Supabase returns joined items under 'items_cotizacion'; remap to 'items'
  const d = data as Record<string, unknown>
  return { ...d, items: d.items_cotizacion } as Cotizacion
}

export async function folioExists(folio: string) {
  const { data } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('id', folio)
    .maybeSingle()
  return !!data
}

export async function createCotizacion(cotizacion: Partial<Cotizacion>) {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .insert(cotizacion)
    .select()
    .single()
  if (error) throw error
  return data as Cotizacion
}

export async function updateCotizacion(id: string, updates: Partial<Cotizacion>) {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Cotizacion
}

export async function deleteCotizacion(id: string) {
  const { error } = await supabaseAdmin
    .from('cotizaciones')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getNextFolio() {
  // Trae los últimos folios y en JS filtra los que son complementarias (terminan en -A, -B, etc.)
  // Esto evita depender de la columna es_complementaria_de que puede no existir
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  if (!data || data.length === 0) return 'SH001'
  // Salta folios tipo SH006-A (complementarias)
  const principal = data.find(c => !/-[A-Z]$/.test(c.id))
  if (!principal) return 'SH001'
  const match = principal.id.match(/^(.*?)(\d+)$/)
  if (!match) return 'SH001'
  const prefix = match[1]
  const num = parseInt(match[2], 10) + 1
  return prefix + num.toString().padStart(match[2].length, '0')
}

export async function getNextFolioComplementaria(baseFolio: string) {
  // Busca complementarias existentes de este folio base
  const { data } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('es_complementaria_de', baseFolio)
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return `${baseFolio}-A`

  // Encuentra la letra más alta usada (SH006-A → 65, SH006-B → 66, ...)
  const maxCode = data.reduce((max, c) => {
    const match = c.id.match(/-([A-Z])$/)
    return match ? Math.max(max, match[1].charCodeAt(0)) : max
  }, 64) // 64 = charCode de 'A' - 1

  return `${baseFolio}-${String.fromCharCode(maxCode + 1)}`
}

// ==================== ITEMS ====================

export async function getItemsByCotizacion(cotizacionId: string) {
  const { data, error } = await supabaseAdmin
    .from('items_cotizacion')
    .select('*')
    .eq('cotizacion_id', cotizacionId)
    .order('orden')
  if (error) throw error
  return data as ItemCotizacion[]
}

export async function upsertItems(items: Partial<ItemCotizacion>[]) {
  const { data, error } = await supabaseAdmin
    .from('items_cotizacion')
    .upsert(items)
    .select()
  if (error) throw error
  return data
}

export async function deleteItemsByCotizacion(cotizacionId: string) {
  const { error } = await supabaseAdmin
    .from('items_cotizacion')
    .delete()
    .eq('cotizacion_id', cotizacionId)
  if (error) throw error
}

// ==================== RESPONSABLES ====================

export async function getResponsables() {
  const { data, error } = await supabaseAdmin
    .from('responsables')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data as Responsable[]
}

export async function getResponsableById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('responsables')
    .select('*, historial_responsable(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createResponsable(responsable: Partial<Responsable>) {
  const { data, error } = await supabaseAdmin
    .from('responsables')
    .insert(responsable)
    .select()
    .single()
  if (error) throw error
  return data as Responsable
}

export async function updateResponsable(id: string, updates: Partial<Responsable>) {
  const { data, error } = await supabaseAdmin
    .from('responsables')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Responsable
}

// ==================== PROYECTOS ====================

export async function getProyectos() {
  const { data, error } = await supabaseAdmin
    .from('proyectos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Proyecto[]
}

export async function getProyectoById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('proyectos')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Proyecto
}

export async function createProyecto(proyecto: Partial<Proyecto>) {
  const { data, error } = await supabaseAdmin
    .from('proyectos')
    .insert(proyecto)
    .select()
    .single()
  if (error) throw error
  return data as Proyecto
}

export async function updateProyecto(id: string, updates: Partial<Proyecto>) {
  const { data, error } = await supabaseAdmin
    .from('proyectos')
    .update({ ...updates, ultima_actualizacion: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Proyecto
}

// ==================== CUENTAS POR PAGAR ====================

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

export async function createCuentasPagarDesdeCotizacion(cotizacionId: string) {
  const items = await getItemsByCotizacion(cotizacionId)
  console.log(`[createCuentasPagar] items encontrados: ${items.length}`, items.map(i => ({ id: i.id, desc: i.descripcion, x_pagar: i.x_pagar, responsable: i.responsable_nombre })))

  const cuentas = items
    .filter(item => item.x_pagar > 0)
    .map(item => ({
      cotizacion_id: cotizacionId,
      proyecto_id: cotizacionId,
      responsable_nombre: item.responsable_nombre || 'Sin asignar',
      responsable_id: item.responsable_id,
      item_descripcion: item.descripcion,
      cantidad: item.cantidad,
      x_pagar: item.x_pagar,
      margen: item.margen,
      estado: 'PENDIENTE'
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
  console.log(`[createCuentasPagarConProyecto] cotizacion=${cotizacionId} proyecto=${proyectoId} items=${items.length}`, items.map(i => ({ id: i.id, desc: i.descripcion, x_pagar: i.x_pagar, responsable: i.responsable_nombre })))
  const cuentas = items
    .filter(item => item.x_pagar > 0)
    .map(item => ({
      cotizacion_id: cotizacionId,
      proyecto_id: proyectoId,
      responsable_nombre: item.responsable_nombre || 'Sin asignar',
      responsable_id: item.responsable_id,
      item_descripcion: item.descripcion,
      cantidad: item.cantidad,
      x_pagar: item.x_pagar,
      margen: item.margen,
      estado: 'PENDIENTE'
    }))

  console.log(`[createCuentasPagarConProyecto] cuentas a crear: ${cuentas.length}`)
  if (cuentas.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .insert(cuentas)
    .select()
  console.log(`[createCuentasPagarConProyecto] resultado inserción:`, { data, error })
  if (error) throw error
  return data as CuentaPagar[]
}

// ==================== HISTORIAL RESPONSABLE ====================

export async function generarHistorialProyecto(proyectoId: string, proyecto: Proyecto) {
  // 1. Cotización principal (mismo ID que el proyecto) + complementarias aprobadas
  const cotizacionIds: string[] = [proyectoId]

  const { data: complementarias } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('es_complementaria_de', proyectoId)
    .eq('estado', 'APROBADA')

  if (complementarias) {
    cotizacionIds.push(...complementarias.map((c: { id: string }) => c.id))
  }

  // 2. Todas las partidas de todas las cotizaciones
  const allItemArrays = await Promise.all(cotizacionIds.map(cid => getItemsByCotizacion(cid)))
  const allItems = allItemArrays.flat()

  // 3. Solo partidas con responsable asignado
  const itemsConResponsable = allItems.filter(item => !!item.responsable_id)

  // 4. Borrar historial previo de este proyecto (idempotencia — snapshot limpio)
  const { error: delError } = await supabaseAdmin
    .from('historial_responsable')
    .delete()
    .eq('proyecto_id', proyectoId)

  if (delError) throw delError

  if (itemsConResponsable.length === 0) return

  // 5. Insertar una fila por partida
  const rows = itemsConResponsable.map(item => ({
    responsable_id: item.responsable_id,
    cotizacion_id: item.cotizacion_id,
    proyecto_id: proyectoId,
    proyecto_nombre: proyecto.proyecto,
    cliente: proyecto.cliente,
    fecha_evento: proyecto.fecha_entrega || null,
    rol_en_proyecto: item.descripcion,
    x_pagar: item.x_pagar || 0,
  }))

  const { error: insError } = await supabaseAdmin
    .from('historial_responsable')
    .insert(rows)

  if (insError) throw insError
}

// ==================== CUENTAS POR COBRAR ====================

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
    .insert({
      cotizacion_id: cotizacion.id,
      cliente: cotizacion.cliente,
      proyecto: cotizacion.proyecto,
      monto_total: cotizacion.total,
      estado: 'PENDIENTE'
    })
    .select()
    .single()
  if (error) throw error
  return data as CuentaCobrar
}
