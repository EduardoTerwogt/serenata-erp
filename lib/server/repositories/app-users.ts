import { supabaseAdmin } from '@/lib/supabase'
import type { AppSection } from '@/auth'

export interface AppUserRecord {
  id: string
  email: string
  password_hash: string
  name: string
  sections: AppSection[]
  active: boolean
  created_at: string
  updated_at: string
}

export interface AppUserPublicRecord {
  id: string
  email: string
  name: string
  sections: AppSection[]
  active: boolean
  created_at: string
  updated_at: string
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isMissingAppUsersTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  const normalized = message.toLowerCase()
  return normalized.includes('app_users') && (
    normalized.includes('relation') ||
    normalized.includes('does not exist') ||
    normalized.includes('schema cache')
  )
}

function toPublicUser(row: AppUserRecord): AppUserPublicRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    sections: Array.isArray(row.sections) ? row.sections : [],
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function getAppUserByEmail(email: string): Promise<AppUserRecord | null> {
  const normalizedEmail = normalizeEmail(email)
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('id, email, password_hash, name, sections, active, created_at, updated_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (error) {
    if (isMissingAppUsersTableError(error)) return null
    throw error
  }

  if (!data || !data.active) return null
  return data as AppUserRecord
}

export async function listAppUsers(): Promise<AppUserPublicRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('id, email, name, sections, active, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data || []) as AppUserRecord[]).map(toPublicUser)
}

export async function createAppUser(input: {
  email: string
  passwordHash: string
  name: string
  sections: AppSection[]
  active?: boolean
}): Promise<AppUserPublicRecord> {
  const payload = {
    email: normalizeEmail(input.email),
    password_hash: input.passwordHash,
    name: input.name.trim(),
    sections: input.sections,
    active: input.active ?? true,
  }

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .insert(payload)
    .select('id, email, name, sections, active, created_at, updated_at')
    .single()

  if (error) throw error
  return data as AppUserPublicRecord
}

export async function updateAppUser(
  id: string,
  updates: Partial<{
    email: string
    passwordHash: string
    name: string
    sections: AppSection[]
    active: boolean
  }>
): Promise<AppUserPublicRecord> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (updates.email !== undefined) payload.email = normalizeEmail(updates.email)
  if (updates.passwordHash !== undefined) payload.password_hash = updates.passwordHash
  if (updates.name !== undefined) payload.name = updates.name.trim()
  if (updates.sections !== undefined) payload.sections = updates.sections
  if (updates.active !== undefined) payload.active = updates.active

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .update(payload)
    .eq('id', id)
    .select('id, email, name, sections, active, created_at, updated_at')
    .single()

  if (error) throw error
  return data as AppUserPublicRecord
}
