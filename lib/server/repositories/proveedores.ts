import { supabaseAdmin } from '@/lib/supabase'
import {
  Proveedor,
} from '@/lib/types'

export async function getProveedores() {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return data as Proveedor[]
}

export async function getProveedorById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .select('*, historial_responsable(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createProveedor(proveedor: Partial<Proveedor>) {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .insert(proveedor)
    .select()
    .single()
  if (error) throw error
  return data as Proveedor
}

export async function updateProveedor(id: string, updates: Partial<Proveedor>) {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Proveedor
}

// Busca un proveedor por nombre exacto (case-insensitive) o lo crea con
// datos mínimos (solo nombre) si no existe. Usado al asignar responsable en
// una partida por texto libre (Fase 5.3, Bloque 0, punto 2): la asignación
// siempre debe resolver a un id real, nunca quedarse en solo texto suelto.
// Datos fiscales/bancarios se llenan después, a mano o vía el futuro Portal.
export async function findOrCreateProveedorByNombre(nombre: string): Promise<Proveedor> {
  const nombreLimpio = nombre.trim()
  const { data: existente, error: buscarError } = await supabaseAdmin
    .from('proveedores')
    .select('*')
    .ilike('nombre', nombreLimpio)
    .limit(1)
    .maybeSingle()
  if (buscarError) throw buscarError
  if (existente) return existente as Proveedor

  const { data: creado, error: crearError } = await supabaseAdmin
    .from('proveedores')
    .insert({ nombre: nombreLimpio, activo: true })
    .select()
    .single()
  if (crearError) throw crearError
  return creado as Proveedor
}
