/**
 * Sesión del Portal de Proveedores (Fase 5.5) -- separada de NextAuth
 * (auth.ts), que es solo para staff interno (tabla `usuarios`). Un
 * proveedor no es un `usuario` interno, así que usa su propio mecanismo de
 * sesión, del mismo espíritu que `lib/api-auth.ts` (`{ proveedorId, response }`).
 *
 * Firma HMAC-SHA256 con Web Crypto (Edge-compatible, mismo enfoque que
 * `lib/auth-utils.ts`) -- sin librería nueva (jsonwebtoken/jose).
 */
import { cookies } from 'next/headers'

const COOKIE_NAME = 'portal_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60 // 60 días

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET no configurado')
  return secret
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

export async function signPortalSession(proveedorId: string): Promise<string> {
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const payload = `${proveedorId}.${exp}`
  const signature = await hmac(payload)
  return `${payload}.${signature}`
}

export async function verifyPortalSession(token: string): Promise<{ proveedorId: string } | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [proveedorId, expStr, signature] = parts
  const exp = Number(expStr)
  if (!proveedorId || !Number.isFinite(exp)) return null
  if (Date.now() > exp) return null

  const expected = await hmac(`${proveedorId}.${expStr}`)
  if (!constantTimeEqual(expected, signature)) return null

  return { proveedorId }
}

export async function setPortalSessionCookie(proveedorId: string): Promise<void> {
  const token = await signPortalSession(proveedorId)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  })
}

export async function clearPortalSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

/**
 * Mismo idioma que `requireSection()` (lib/api-auth.ts): retorna
 * `{ proveedorId, response }`, donde `response` viene seteado si no hay
 * sesión válida -- el caller solo hace `if (r.response) return r.response`.
 */
export async function requirePortalSession(): Promise<
  { proveedorId: string; response: null } | { proveedorId: null; response: Response }
> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) {
    return { proveedorId: null, response: Response.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const session = await verifyPortalSession(token)
  if (!session) {
    return { proveedorId: null, response: Response.json({ error: 'Sesión inválida o expirada' }, { status: 401 }) }
  }

  return { proveedorId: session.proveedorId, response: null }
}
