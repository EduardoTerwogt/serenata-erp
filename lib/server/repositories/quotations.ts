import { supabaseAdmin } from '@/lib/supabase'
import {
  Cotizacion,
  ItemCotizacion,
} from '@/lib/types'

export async function getCotizaciones() {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Cotizacion[]
}

export async function getCotizacionById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('*, items_cotizacion(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  const d = data as Record<string, unknown>
  return { ...d, items: d.items_cotizacion } as Cotizacion
}

export async function folioExists(folio: string) {
  const { data } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('id', folio)
    .maybeSingle()
  return !!data
}

export async function createCotizacion(cotizacion: Partial<Cotizacion>) {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .insert(cotizacion)
    .select()
    .single()
  if (error) throw error
  return data as Cotizacion
}

export async function updateCotizacion(id: string, updates: Partial<Cotizacion>) {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Cotizacion
}

export async function deleteCotizacion(id: string) {
  const { error } = await supabaseAdmin
    .from('cotizaciones')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getNextFolio() {
  const { data, error } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  if (!data || data.length === 0) return 'SH001'
  const principal = data.find(c => !/-[A-Z]$/.test(c.id))
  if (!principal) return 'SH001'
  const match = principal.id.match(/^(.*?)(\d+)$/)
  if (!match) return 'SH001'
  const prefix = match[1]
  const num = parseInt(match[2], 10) + 1
  return prefix + num.toString().padStart(match[2].length, '0')
}

export async function getNextFolioComplementaria(baseFolio: string) {
  const { data } = await supabaseAdmin
    .from('cotizaciones')
    .select('id')
    .eq('es_complementaria_de', baseFolio)
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return `${baseFolio}-A`

  const maxCode = data.reduce((max, c) => {
    const match = c.id.match(/-([A-Z])$/)
    return match ? Math.max(max, match[1].charCodeAt(0)) : max
  }, 64)

  return `${baseFolio}-${String.fromCharCode(maxCode + 1)}`
}

export async function getItemsByCotizacion(cotizacionId: string) {
  const { data, error } = await supabaseAdmin
    .from('items_cotizacion')
    .select('*')
    .eq('cotizacion_id', cotizacionId)
    .order('orden')
  if (error) throw error
  return data as ItemCotizacion[]
}

export async function upsertItems(items: Partial<ItemCotizacion>[]) {
  const { data, error } = await supabaseAdmin
    .from('items_cotizacion')
    .upsert(items)
    .select()
  if (error) throw error
  return data
}

export async function deleteItemsByCotizacion(cotizacionId: string) {
  const { error } = await supabaseAdmin
    .from('items_cotizacion')
    .delete()
    .eq('cotizacion_id', cotizacionId)
  if (error) throw error
}
