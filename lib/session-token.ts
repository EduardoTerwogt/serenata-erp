import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'
import { headers } from 'next/headers'

export type SessionTokenClaims = {
  sub?: string
  email?: string
  name?: string
  sections?: string[]
  session_version?: number
  exp?: number
}

// AUTH_SECRET es la única variable canónica (igual que lib/portal-auth.ts):
// sin fallback a NEXTAUTH_SECRET, para que staff y Portal nunca firmen o
// verifiquen con secretos distintos sin que nadie lo note.
function sessionSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('[session-token] Falta AUTH_SECRET en el entorno')
  }
  return secret
}

/**
 * F28: decodifica el JWT de sesión sin pasar por `auth()`. `auth()` usado
 * como middleware (antes en `proxy.ts`) vuelve a firmar y reemite el cookie
 * de sesión en CADA invocación (confirmado en el código fuente instalado de
 * `@auth/core`: `lib/actions/session.js`, estrategia `jwt`, sin chequeo de
 * `updateAge`) -- bajo requests concurrentes contra la misma sesión, dos
 * rotaciones pueden pisarse y dejar a un cliente con el cookie superado,
 * deslogueado hasta el próximo login. Sigue abierto upstream:
 * nextauthjs/next-auth#8897. `getToken()` es puramente de lectura: nunca
 * emite `Set-Cookie`.
 */
export async function getEdgeSessionToken(req: NextRequest): Promise<SessionTokenClaims | null> {
  const token = await getToken({
    req,
    secret: sessionSecret(),
    secureCookie: req.nextUrl.protocol === 'https:',
  })
  return token as SessionTokenClaims | null
}

/**
 * Equivalente para Route Handlers (`lib/api-auth.ts`), donde no hay un
 * `NextRequest` real disponible sin threadearlo por ~330 call-sites de
 * `requireSection`/`requireAnySection`. `next/headers`'s `headers()` ya
 * expone el header `cookie` de la request en curso.
 */
export async function getNodeSessionToken(): Promise<SessionTokenClaims | null> {
  const h = await headers()
  const token = await getToken({
    req: { headers: h },
    secret: sessionSecret(),
    secureCookie: (h.get('x-forwarded-proto') ?? 'http') === 'https',
  })
  return token as SessionTokenClaims | null
}
