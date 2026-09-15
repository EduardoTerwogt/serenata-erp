import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth-utils'
import { validate, PortalLoginSchema } from '@/lib/validation/schemas'
import { getProveedorByCorreo, updateProveedor } from '@/lib/db'
import { setPortalSessionCookie } from '@/lib/portal-auth'
import { checkRateLimit, getClientIp } from '@/lib/server/rate-limit'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE = 'POST /api/portal/login'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = validate(PortalLoginSchema, body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    const { correo, password } = parsed.data

    // Fase 2.4: por IP (frena enumeración probando muchos correos desde un
    // mismo origen) y por identidad (frena fuerza bruta sobre una cuenta).
    const ip = getClientIp(request)
    const [ipOk, emailOk] = await Promise.all([
      checkRateLimit(`portal-login:ip:${ip}`, 20, 15 * 60),
      checkRateLimit(`portal-login:email:${correo.toLowerCase()}`, 5, 15 * 60),
    ])
    if (!ipOk || !emailOk) {
      return Response.json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' }, { status: 429 })
    }

    const proveedor = await getProveedorByCorreo(correo)
    if (!proveedor || proveedor.portal_estado === null) {
      return Response.json({ error: 'Correo o contraseña incorrectos' }, { status: 401 })
    }

    const valido = await verifyPassword(password, proveedor.password_hash as string)
    if (!valido) {
      return Response.json({ error: 'Correo o contraseña incorrectos' }, { status: 401 })
    }

    if (needsRehash(proveedor.password_hash as string)) {
      // Rehash-on-login (Fase 2.3): mismo criterio que auth.ts.
      try {
        const newHash = await hashPassword(password)
        await updateProveedor(proveedor.id, { password_hash: newHash })
      } catch (e) {
        console.error('[portal/login] No se pudo re-hashear el password a Argon2id:', e)
      }
    }

    await setPortalSessionCookie(proveedor.id, proveedor.session_version)

    return Response.json({
      success: true,
      requiere_confirmacion: proveedor.portal_estado === 'pendiente_confirmacion',
    })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
