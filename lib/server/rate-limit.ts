import { supabaseAdmin } from '@/lib/supabase'

/**
 * Auditoría externa 2026-09-09 (Fase 2.4). Sin Upstash/Vercel KV disponible
 * (no hay cuenta de pago), se implementa con lo que ya se tiene: una tabla
 * en Supabase + la RPC check_rate_limit (INSERT ... ON CONFLICT ...
 * RETURNING, atómica). Ver docs/ROADMAP.md para la recomendación de migrar
 * a un store dedicado si el volumen lo justifica.
 *
 * Si la RPC falla (la tabla no responde, etc.) se falla CERRADO -- se
 * bloquea el intento -- a propósito: el punto de este cambio es no repetir
 * el patrón de "si la BD falla, dejar pasar todo" que la auditoría señaló
 * en el limiter de IA existente.
 */
export async function checkRateLimit(key: string, maxAttempts: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_key: key,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('[rate-limit] check_rate_limit falló, bloqueando por seguridad:', error)
    return false
  }
  return data === true
}

/** IP del cliente detrás del proxy de Vercel. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}
