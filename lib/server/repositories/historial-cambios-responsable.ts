import { supabaseAdmin } from '@/lib/supabase'
import { HistorialCambioResponsableItem } from '@/lib/types'

// Log append-only: nunca se borra ni reconstruye (a diferencia de
// historial_responsable, que sí se regenera por proyecto).
export async function createHistorialCambioResponsableItem(entry: {
  item_id: string
  cotizacion_id: string
  responsable_anterior_id: string | null
  responsable_anterior_nombre: string | null
  responsable_nuevo_id: string | null
  responsable_nuevo_nombre: string | null
  changed_by?: string | null
}) {
  const { data, error } = await supabaseAdmin
    .from('historial_cambios_responsable_item')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data as HistorialCambioResponsableItem
}

export async function getHistorialCambiosResponsableByItem(itemId: string) {
  const { data, error } = await supabaseAdmin
    .from('historial_cambios_responsable_item')
    .select('*')
    .eq('item_id', itemId)
    .order('changed_at', { ascending: false })
  if (error) throw error
  return data as HistorialCambioResponsableItem[]
}

export async function getHistorialCambiosResponsableByCotizacion(cotizacionId: string) {
  const { data, error } = await supabaseAdmin
    .from('historial_cambios_responsable_item')
    .select('*')
    .eq('cotizacion_id', cotizacionId)
    .order('changed_at', { ascending: false })
  if (error) throw error
  return data as HistorialCambioResponsableItem[]
}
