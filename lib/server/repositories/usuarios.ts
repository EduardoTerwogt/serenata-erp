import { supabaseAdmin } from '@/lib/supabase'
import type { AuthUser } from '@/lib/auth-utils'

export interface UsuarioRow {
  id: string
  email: string
  name: string
  password_hash: string
  sections: string[]
  active: boolean
  created_at: string
}

export async function getUsuarios(): Promise<UsuarioRow[]> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, email, name, sections, active, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as UsuarioRow[]
}

export async function getUsuariosForAuth(): Promise<AuthUser[]> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, email, name, password_hash, sections')
    .eq('active', true)
  if (error) throw error
  return (data as UsuarioRow[]).map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    passwordHash: u.password_hash,
    sections: u.sections,
  }))
}

export async function getUsuarioById(id: string): Promise<UsuarioRow | null> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, email, name, sections, active, created_at')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as UsuarioRow
}

export async function createUsuario(input: {
  email: string
  name: string
  password_hash: string
  sections: string[]
}): Promise<UsuarioRow> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .insert({ ...input, active: true })
    .select('id, email, name, sections, active, created_at')
    .single()
  if (error) throw error
  return data as UsuarioRow
}

export async function updateUsuario(
  id: string,
  updates: Partial<{ name: string; email: string; password_hash: string; sections: string[]; active: boolean }>
): Promise<UsuarioRow> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .update(updates)
    .eq('id', id)
    .select('id, email, name, sections, active, created_at')
    .single()
  if (error) throw error
  return data as UsuarioRow
}
