import { supabaseAdmin } from '@/lib/supabase'
import {
  Responsable,
} from '@/lib/types'

export async function getResponsables() {
  const { data, error } = await supabaseAdmin
    .from('responsables')
    .select('id, nombre, email, telefono')
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
