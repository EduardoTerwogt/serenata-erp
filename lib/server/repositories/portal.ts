import { supabaseAdmin } from '@/lib/supabase'
import { CandidatoMatchProveedor, CuentaPagar, Proveedor, ProveedorDocumento } from '@/lib/types'

// Fase 5.5 -- Portal de proveedores. La identidad de portal ES la misma
// fila de `proveedores` (ver migración 20260907_fase55...): estas funciones
// solo agregan lo que falta encima de proveedores.ts/cuentas-pagar.ts, sin
// duplicar los CRUD genéricos que ya existen ahí (updateProveedor, etc.).

export async function crearProveedorDesdeSignup(data: {
  nombre: string
  correo: string
  password_hash: string
  regimen_fiscal: Proveedor['regimen_fiscal']
}): Promise<Proveedor> {
  const { data: creado, error } = await supabaseAdmin
    .from('proveedores')
    .insert({
      nombre: data.nombre,
      correo: data.correo,
      password_hash: data.password_hash,
      regimen_fiscal: data.regimen_fiscal,
      activo: true,
      portal_estado: 'activo',
    })
    .select()
    .single()
  if (error) throw error
  return creado as Proveedor
}

export async function getProveedorByCorreo(correo: string): Promise<Proveedor | null> {
  const { data, error } = await supabaseAdmin
    .from('proveedores')
    .select('*')
    .eq('correo', correo)
    .not('password_hash', 'is', null)
    .maybeSingle()
  if (error) throw error
  return data as Proveedor | null
}

export async function buscarCandidatosMatch(nombre: string, excluirId: string): Promise<CandidatoMatchProveedor[]> {
  const { data, error } = await supabaseAdmin.rpc('match_proveedor_por_nombre', {
    p_nombre: nombre,
    p_excluir_id: excluirId,
  })
  if (error) throw error
  return (data ?? []) as CandidatoMatchProveedor[]
}

// Fusiona la fila recién creada del signup (`nuevoId`, sin historial todavía)
// hacia el proveedor existente que el usuario confirmó como "soy yo"
// (`candidatoId`, que sí trae cuentas/historial). El candidato es el que
// sobrevive -- se le copian las credenciales y documentos del signup, y la
// fila nueva se borra (no queda ninguna otra referencia a ella: se creó
// segundos antes, en el mismo request de signup).
export async function confirmarMatch(nuevoId: string, candidatoId: string): Promise<Proveedor> {
  const { data: nuevo, error: nuevoError } = await supabaseAdmin
    .from('proveedores')
    .select('correo, password_hash')
    .eq('id', nuevoId)
    .single()
  if (nuevoError) throw nuevoError

  const { data: candidatoActualizado, error: updateError } = await supabaseAdmin
    .from('proveedores')
    .update({
      correo: nuevo.correo,
      password_hash: nuevo.password_hash,
      portal_estado: 'activo',
      match_candidato_id: null,
    })
    .eq('id', candidatoId)
    .select()
    .single()
  if (updateError) throw updateError

  const { error: reasignarDocsError } = await supabaseAdmin
    .from('proveedor_documentos')
    .update({ proveedor_id: candidatoId })
    .eq('proveedor_id', nuevoId)
  if (reasignarDocsError) throw reasignarDocsError

  const { error: borrarError } = await supabaseAdmin.from('proveedores').delete().eq('id', nuevoId)
  if (borrarError) throw borrarError

  return candidatoActualizado as Proveedor
}

export async function getCuentasPagarPorProveedor(proveedorId: string): Promise<CuentaPagar[]> {
  const { data, error } = await supabaseAdmin
    .from('cuentas_pagar')
    .select('*')
    .eq('responsable_id', proveedorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as CuentaPagar[]
}

export async function createProveedorDocumento(documento: Partial<ProveedorDocumento>): Promise<ProveedorDocumento> {
  const { data, error } = await supabaseAdmin
    .from('proveedor_documentos')
    .insert(documento)
    .select()
    .single()
  if (error) throw error
  return data as ProveedorDocumento
}

export async function getProveedorDocumentos(proveedorId: string): Promise<ProveedorDocumento[]> {
  const { data, error } = await supabaseAdmin
    .from('proveedor_documentos')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ProveedorDocumento[]
}
