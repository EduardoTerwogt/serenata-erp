import { hashPassword } from '@/lib/auth-utils'
import { getLiveSupabaseAdmin } from './live-cleanup'

/**
 * Segundo usuario para las pruebas de colaboración real.
 *
 * El proyecto de prueba tiene un solo usuario, y con uno solo la colaboración es
 * intestable: `useQuotationPresence` descarta toda señal cuyo `user_id` coincide con
 * el propio, así que dos pestañas del mismo usuario se ignoran entre sí. En vez de
 * pedir secretos nuevos de CI, el propio test siembra el segundo usuario con el
 * service-role que el job ya tiene.
 *
 * `getAuthUser()` lee la tabla `usuarios` en CADA intento de login, así que un
 * usuario recién insertado sirve de inmediato: no hace falta reiniciar la app.
 */
export interface LiveUserSeed {
  email: string
  password: string
  name: string
  sections?: string[]
}

const DEFAULT_SECTIONS = ['cotizaciones', 'cuentas', 'proyectos', 'responsables', 'dashboard']

export async function ensureLiveUser({ email, password, name, sections = DEFAULT_SECTIONS }: LiveUserSeed) {
  const supabase = getLiveSupabaseAdmin()
  // Mismo formato que produce la app: PBKDF2 "saltHex:hashHex" (lib/auth-utils.ts).
  const password_hash = await hashPassword(password)

  const { data: existing, error: readError } = await supabase
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (readError) throw readError

  // Idempotente a propósito: si quedó de una corrida anterior se reescribe el hash,
  // para que la contraseña sea siempre la que el test va a usar.
  if (existing?.id) {
    const { error } = await supabase
      .from('usuarios')
      .update({ password_hash, name, sections, active: true })
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('usuarios')
    .insert({ email, name, password_hash, sections, active: true })
  if (error) throw error
}

export async function cleanupLiveUser(email: string) {
  const supabase = getLiveSupabaseAdmin()
  const { error } = await supabase.from('usuarios').delete().eq('email', email)
  if (error) throw error
}
