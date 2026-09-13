import { supabaseAdmin } from '@/lib/server/supabase-admin'
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

/**
 * Auditoría externa 2026-09-09 (Fase 2.2): antes se traían todos los
 * usuarios activos (con sus password_hash) en cada intento de login y se
 * filtraba en JS. Consultar por email evita traer hashes ajenos que no
 * hacen falta para esa autenticación.
 */
export async function getUsuarioForAuthByEmail(email: string): Promise<AuthUser | null> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('id, email, name, password_hash, sections, session_version')
    .eq('email', email)
    .eq('active', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const u = data as UsuarioRow & { session_version: number }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    passwordHash: u.password_hash,
    sections: u.sections,
    sessionVersion: u.session_version,
  }
}

/**
 * EF-2 1B-2b: espejo de `getProveedorSessionState` (lib/server/repositories/proveedores.ts)
 * para staff -- usado por `requireAuthenticated()` (lib/api-auth.ts) para
 * comprobar, en cada request autenticado, que la sesión (JWT) no fue
 * invalidada desde que se emitió (usuario desactivado, o `sections`/
 * `password_hash`/`email` cambiados vía `admin_update_usuario`).
 */
export async function getUsuarioSessionState(id: string): Promise<{ active: boolean; session_version: number } | null> {
  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('active, session_version')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data as { active: boolean; session_version: number }
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

/**
 * Update directo, sin pasar por `admin_update_usuario` -- nunca bumpea
 * `session_version`. Uso legítimo: el rehash-on-login transparente de
 * `auth.ts` (Argon2id), que persiste un nuevo `password_hash` para el
 * MISMO login que se está emitiendo en ese momento, no una acción de un
 * administrador sobre la sesión de alguien más. El panel de administración
 * (`app/api/admin/usuarios/[id]/route.ts`) usa `adminUpdateUsuario` en su
 * lugar -- ver 1B-2a/1B-2b.
 */
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

/**
 * EF-2 1B-2a/1B-2b: única vía para que el panel de administración
 * modifique un usuario de staff -- llama a la RPC atómica
 * `admin_update_usuario`, que bumpea `session_version` en la misma
 * transacción cuando cambia `active`/`sections`/`password_hash`/`email`
 * (nunca cuando solo cambia `name`). Mismo shape de retorno que
 * `updateUsuario()` (nunca `password_hash`).
 */
export async function adminUpdateUsuario(
  id: string,
  updates: Partial<{ name: string; email: string; password_hash: string; sections: string[]; active: boolean }>
): Promise<UsuarioRow> {
  const { data, error } = await supabaseAdmin.rpc('admin_update_usuario', { p_id: id, p_updates: updates })
  if (error) throw error
  return data as UsuarioRow
}
