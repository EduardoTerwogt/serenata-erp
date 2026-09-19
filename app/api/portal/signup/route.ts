import { hashPassword } from '@/lib/auth-utils'
import { validate, PortalSignupSchema } from '@/lib/validation/schemas'
import { crearProveedorDesdeSignup, getProveedorByCorreo } from '@/lib/db'
import { setPortalSessionCookie } from '@/lib/portal-auth'
import { checkRateLimit, getClientIp } from '@/lib/server/rate-limit'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE = 'POST /api/portal/signup'

/**
 * Registro ligero: correo, password y nombre/alias opcional (ej. "Chok" en
 * vez del nombre legal completo) -- sin documentos todavía. El nombre legal
 * y el cruce contra proveedores ya cargados por staff (matching) ocurren
 * después, cuando el proveedor sube su INE/constancia desde
 * /portal/documentos (ver app/api/portal/documentos/route.ts).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = validate(PortalSignupSchema, body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    const { correo, password } = parsed.data
    const nombre = parsed.data.nombre?.trim() || correo.split('@')[0]
    const alias = parsed.data.alias?.trim() || null

    // Fase 2.4: por IP -- frena creación masiva de cuentas.
    const ip = getClientIp(request)
    const ipOk = await checkRateLimit(`portal-signup:ip:${ip}`, 5, 60 * 60)
    if (!ipOk) {
      return Response.json({ error: 'Demasiados registros desde esta conexión. Intenta más tarde.' }, { status: 429 })
    }

    const existente = await getProveedorByCorreo(correo)
    if (existente) {
      return Response.json({ error: 'Ya existe una cuenta de portal con ese correo' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const proveedor = await crearProveedorDesdeSignup({
      nombre,
      alias,
      correo,
      password_hash: passwordHash,
      regimen_fiscal: null,
    })

    await setPortalSessionCookie(proveedor.id, proveedor.session_version)

    return Response.json({ success: true })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
