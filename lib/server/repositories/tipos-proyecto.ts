import { supabaseAdmin } from '@/lib/supabase'
import type {
  TipoProyecto,
  TipoProyectoConEtapas,
  TipoProyectoEtapa,
  TipoProyectoTareaDefault,
} from '@/lib/types'

export async function getTiposProyecto(): Promise<TipoProyectoConEtapas[]> {
  const { data, error } = await supabaseAdmin
    .from('tipos_proyecto')
    .select('*, tipo_proyecto_etapas(*)')
    .order('nombre', { ascending: true })
  if (error) throw error

  return (data || []).map((row: Record<string, unknown>) => ({
    ...(row as unknown as TipoProyecto),
    etapas: ((row.tipo_proyecto_etapas as TipoProyectoEtapa[]) || []).sort((a, b) => a.orden - b.orden),
  }))
}

export async function getTipoProyectoById(id: string): Promise<TipoProyectoConEtapas> {
  const { data, error } = await supabaseAdmin
    .from('tipos_proyecto')
    .select('*, tipo_proyecto_etapas(*)')
    .eq('id', id)
    .single()
  if (error) throw error

  const row = data as Record<string, unknown>
  return {
    ...(row as unknown as TipoProyecto),
    etapas: ((row.tipo_proyecto_etapas as TipoProyectoEtapa[]) || []).sort((a, b) => a.orden - b.orden),
  }
}

export async function createTipoProyecto(nombre: string): Promise<TipoProyecto> {
  const { data, error } = await supabaseAdmin
    .from('tipos_proyecto')
    .insert({ nombre })
    .select()
    .single()
  if (error) throw error
  return data as TipoProyecto
}

export async function updateTipoProyecto(id: string, updates: Partial<TipoProyecto>): Promise<TipoProyecto> {
  const { data, error } = await supabaseAdmin
    .from('tipos_proyecto')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as TipoProyecto
}

export async function getEtapasByTipo(tipoProyectoId: string): Promise<TipoProyectoEtapa[]> {
  const { data, error } = await supabaseAdmin
    .from('tipo_proyecto_etapas')
    .select('*')
    .eq('tipo_proyecto_id', tipoProyectoId)
    .order('orden', { ascending: true })
  if (error) throw error
  return data as TipoProyectoEtapa[]
}

export async function getEtapaById(id: string): Promise<TipoProyectoEtapa> {
  const { data, error } = await supabaseAdmin
    .from('tipo_proyecto_etapas')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as TipoProyectoEtapa
}

export async function createEtapa(
  tipoProyectoId: string,
  etapa: Pick<TipoProyectoEtapa, 'nombre' | 'orden'> & Partial<Pick<TipoProyectoEtapa, 'es_etapa_final'>>
): Promise<TipoProyectoEtapa> {
  const { data, error } = await supabaseAdmin
    .from('tipo_proyecto_etapas')
    .insert({ ...etapa, tipo_proyecto_id: tipoProyectoId })
    .select()
    .single()
  if (error) throw error
  return data as TipoProyectoEtapa
}

export async function updateEtapa(id: string, updates: Partial<TipoProyectoEtapa>): Promise<TipoProyectoEtapa> {
  const { data, error } = await supabaseAdmin
    .from('tipo_proyecto_etapas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as TipoProyectoEtapa
}

export async function deleteEtapa(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tipo_proyecto_etapas')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getTareasDefaultByTipo(tipoProyectoId: string): Promise<TipoProyectoTareaDefault[]> {
  const { data, error } = await supabaseAdmin
    .from('tipo_proyecto_tarea_default')
    .select('*')
    .eq('tipo_proyecto_id', tipoProyectoId)
    .order('orden', { ascending: true })
  if (error) throw error
  return data as TipoProyectoTareaDefault[]
}

export async function createTareaDefault(
  tipoProyectoId: string,
  tarea: Omit<TipoProyectoTareaDefault, 'id' | 'tipo_proyecto_id' | 'created_at'>
): Promise<TipoProyectoTareaDefault> {
  const { data, error } = await supabaseAdmin
    .from('tipo_proyecto_tarea_default')
    .insert({ ...tarea, tipo_proyecto_id: tipoProyectoId })
    .select()
    .single()
  if (error) throw error
  return data as TipoProyectoTareaDefault
}

export async function updateTareaDefault(
  id: string,
  updates: Partial<TipoProyectoTareaDefault>
): Promise<TipoProyectoTareaDefault> {
  const { data, error } = await supabaseAdmin
    .from('tipo_proyecto_tarea_default')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as TipoProyectoTareaDefault
}

export async function deleteTareaDefault(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tipo_proyecto_tarea_default')
    .delete()
    .eq('id', id)
  if (error) throw error
}
