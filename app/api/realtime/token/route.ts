import { SignJWT } from 'jose'
import { requireAuthenticated } from '@/lib/api-auth'

// Corto a propósito -- Supabase recomienda una ventana de expiración chica
// para el JWT de autorización de canales privados de Realtime; el cliente
// (lib/realtime/authorize.ts) lo refresca antes de que venza.
const REALTIME_JWT_TTL_SECONDS = 600

export async function GET() {
  const { session, response } = await requireAuthenticated()
  if (response) return response

  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    console.error('[realtime/token] Falta SUPABASE_JWT_SECRET')
    return Response.json({ error: 'Realtime no configurado' }, { status: 500 })
  }

  const user = session!.user as { id?: string | null; email?: string | null; sections?: string[] }

  const token = await new SignJWT({
    // `role: authenticated` es lo que hace que las políticas RLS "to
    // authenticated" de realtime.messages apliquen -- ver
    // db/migrations/20260909_realtime_broadcast_authorization.sql.
    role: 'authenticated',
    sections: user.sections || [],
    email: user.email || undefined,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id || user.email || 'unknown')
    .setIssuedAt()
    .setExpirationTime(`${REALTIME_JWT_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret))

  return Response.json({ token, expires_in: REALTIME_JWT_TTL_SECONDS })
}
