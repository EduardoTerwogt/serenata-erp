/**
 * #123 (B6a, T20): datos fiscales de Serenata, leídos de su Constancia de Situación Fiscal cargada en Admin
 * (`datos_fiscales_serenata`, una fila vigente). Reemplaza a la variable `SERENATA_RFC`: nada va hardcodeado ni en el
 * entorno. Si no hay constancia cargada, las rutas de factura FALLAN explícito (no validan en silencio).
 *
 * Caché corta por instancia (la constancia casi nunca cambia y `serenataRfc` se llama en cada subida de factura): solo
 * se cachea una fila encontrada; la ausencia no se cachea, así la primera constancia surte efecto de inmediato.
 */
import { DomainError } from '@/lib/server/errors/domain-error'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { normalizarRfc } from './rfc'

export interface DatosFiscalesSerenata {
  id: string
  rfc: string
  razon_social: string
  regimen_fiscal: string | null
  tipo_persona: 'moral' | 'fisica'
  codigo_postal: string | null
  constancia_url: string | null
  constancia_nombre: string | null
  vigente: boolean
  actualizado_por: string | null
  created_at: string
}

const CACHE_MS = 60_000
let cache: { datos: DatosFiscalesSerenata; hasta: number } | null = null

export function invalidarCacheDatosFiscales() {
  cache = null
}

export async function datosFiscalesVigentes(): Promise<DatosFiscalesSerenata | null> {
  if (cache && cache.hasta > Date.now()) return cache.datos
  const { data, error } = await supabaseAdmin.from('datos_fiscales_serenata').select('*').eq('vigente', true).maybeSingle()
  if (error) throw error
  if (!data) return null
  cache = { datos: data as DatosFiscalesSerenata, hasta: Date.now() + CACHE_MS }
  return cache.datos
}

/** El RFC de Serenata House según su constancia vigente. Falla explícito (409) si todavía no se cargó (T20). */
export async function serenataRfc(): Promise<string> {
  const datos = await datosFiscalesVigentes()
  const rfc = normalizarRfc(datos?.rfc)
  if (!rfc) {
    throw new DomainError({
      code: 'serenata_fiscal_faltante',
      status: 409,
      safeMessage: 'Falta cargar la Constancia de Situación Fiscal de Serenata en Admin → Datos fiscales; sin ella no se puede saber de quién es cada factura.',
    })
  }
  return rfc
}

/** Constancias cargadas, de la más reciente a la más antigua (la vigente primero). */
export async function historialDatosFiscales(): Promise<DatosFiscalesSerenata[]> {
  const { data, error } = await supabaseAdmin.from('datos_fiscales_serenata').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as DatosFiscalesSerenata[]
}
