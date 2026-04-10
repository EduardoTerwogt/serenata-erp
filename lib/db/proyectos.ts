import { getItemsByCotizacion } from '@/lib/db/cotizaciones'
import { supabaseAdmin } from '@/lib/supabase'
import { Proyecto } from '@/lib/types'

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
