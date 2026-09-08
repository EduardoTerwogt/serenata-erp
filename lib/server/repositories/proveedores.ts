import { supabaseAdmin } from '@/lib/supabase'
import {
  Proveedor,
  TipoDocumentoProveedor,
  EstadoValidacionDocumento,
} from '@/lib/types'

export interface ProveedorDocumentoResumenRow {
  proveedor_id: string
  tipo: TipoDocumentoProveedor
  estado_validacion: EstadoValidacionDocumento
}

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
// Fase 5.8: resumen de documentación para el panel de portal en la lista de
// Proveedores -- trae proveedor_id/tipo/estado_validacion de TODOS los
// documentos (sin filtrar por proveedor) para que la agregación (completa/
// incompleta/con errores) se calcule en JS, mismo criterio que el resto del
// repo para resúmenes ("no vistas SQL nuevas").
export async function getAllProveedorDocumentos(): Promise<ProveedorDocumentoResumenRow[]> {
  const { data, error } = await supabaseAdmin
    .from('proveedor_documentos')
    .select('proveedor_id, tipo, estado_validacion')
  if (error) throw error
  return data as ProveedorDocumentoResumenRow[]
}

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
