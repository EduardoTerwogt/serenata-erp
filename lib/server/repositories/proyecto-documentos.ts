import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { ProyectoDocumento, TipoProyectoDocumento } from '@/lib/types'

export async function getDocumentosByProyecto(proyectoId: string): Promise<ProyectoDocumento[]> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_documentos')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as ProyectoDocumento[]
}

export async function getDocumentoById(id: string): Promise<ProyectoDocumento> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_documentos')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as ProyectoDocumento
}

/**
 * Documento singleton (todos salvo STATUS_REPORT, que se repite) por
 * proyecto+tipo. Devuelve null si aún no se ha generado.
 */
export async function getDocumentoSingleton(
  proyectoId: string,
  tipo: Exclude<TipoProyectoDocumento, 'STATUS_REPORT'>
): Promise<ProyectoDocumento | null> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_documentos')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('tipo', tipo)
    .maybeSingle()
  if (error) throw error
  return data as ProyectoDocumento | null
}

export async function createDocumento(
  proyectoId: string,
  doc: { tipo: TipoProyectoDocumento; titulo?: string | null; contenido?: Record<string, unknown> }
): Promise<ProyectoDocumento> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_documentos')
    .insert({
      proyecto_id: proyectoId,
      tipo: doc.tipo,
      titulo: doc.titulo ?? null,
      contenido: doc.contenido ?? {},
    })
    .select()
    .single()
  if (error) throw error
  return data as ProyectoDocumento
}

/**
 * Crea o reemplaza el contenido auto-generado de un documento singleton.
 * Nunca pisa una edición manual salvo que se pida explícitamente (`force`)
 * -- mismo criterio que "regenerar" desde la UI.
 */
export async function upsertDocumentoAutoGenerado(
  proyectoId: string,
  tipo: Exclude<TipoProyectoDocumento, 'STATUS_REPORT'>,
  contenido: Record<string, unknown>,
  force = false
): Promise<ProyectoDocumento> {
  const existente = await getDocumentoSingleton(proyectoId, tipo)

  if (!existente) {
    const { data, error } = await supabaseAdmin
      .from('proyecto_documentos')
      .insert({ proyecto_id: proyectoId, tipo, contenido, auto_generado_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return data as ProyectoDocumento
  }

  if (existente.editado_manualmente && !force) return existente

  const { data, error } = await supabaseAdmin
    .from('proyecto_documentos')
    .update({ contenido, auto_generado_at: new Date().toISOString(), editado_manualmente: false })
    .eq('id', existente.id)
    .select()
    .single()
  if (error) throw error
  return data as ProyectoDocumento
}

/**
 * Regenera el contenido de un documento ya existente por id (soporta
 * también STATUS_REPORT, que no es singleton). El caller decide si se
 * permite pisar una edición manual (`force`) -- ver
 * POST /api/proyectos/[id]/documentos/[docId]/regenerar.
 */
export async function updateDocumentoAutoGenerado(
  id: string,
  contenido: Record<string, unknown>
): Promise<ProyectoDocumento> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_documentos')
    .update({ contenido, auto_generado_at: new Date().toISOString(), editado_manualmente: false })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ProyectoDocumento
}

export async function updateDocumentoManual(
  id: string,
  updates: { titulo?: string | null; contenido?: Record<string, unknown> }
): Promise<ProyectoDocumento> {
  const { data, error } = await supabaseAdmin
    .from('proyecto_documentos')
    .update({ ...updates, editado_manualmente: true })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as ProyectoDocumento
}

export async function deleteDocumento(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('proyecto_documentos')
    .delete()
    .eq('id', id)
  if (error) throw error
}
