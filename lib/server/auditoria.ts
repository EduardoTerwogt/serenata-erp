import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { ResultadoAuditoria } from '@/lib/shared/auditoria'

/**
 * Corre `auditar_consistencia()` (db/migrations/20261026_b7_auditar_consistencia.sql):
 * solo lectura, sin efectos. Falla explícito si la respuesta no tiene la forma
 * esperada: un resultado vacío o roto no debe leerse como "todo en orden".
 */
export async function ejecutarAuditoria(): Promise<ResultadoAuditoria> {
  const { data, error } = await supabaseAdmin.rpc('auditar_consistencia')
  if (error) throw error
  const r = data as Partial<ResultadoAuditoria> | null
  if (!r || typeof r.total_violaciones !== 'number' || !Array.isArray(r.guardas) || typeof r.ejecutado_en !== 'string') {
    throw new Error('auditar_consistencia devolvió una respuesta inesperada')
  }
  return r as ResultadoAuditoria
}
