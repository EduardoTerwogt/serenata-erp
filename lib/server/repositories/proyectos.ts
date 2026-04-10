import { supabaseAdmin } from '@/lib/supabase'
import {
  Proyecto,
} from '@/lib/types'

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
