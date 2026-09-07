import { hashPassword } from '@/lib/auth-utils'
import { validate, PortalSignupSchema } from '@/lib/validation/schemas'
import { crearProveedorDesdeSignup, getProveedorByCorreo } from '@/lib/db'
import { setPortalSessionCookie } from '@/lib/portal-auth'
import { toErrorMessage } from '@/lib/server/portal/error-message'

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

    const existente = await getProveedorByCorreo(correo)
    if (existente) {
      return Response.json({ error: 'Ya existe una cuenta de portal con ese correo' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const proveedor = await crearProveedorDesdeSignup({
      nombre,
      correo,
      password_hash: passwordHash,
      regimen_fiscal: null,
    })

    await setPortalSessionCookie(proveedor.id)

    return Response.json({ success: true })
  } catch (error) {
    console.error('[portal/signup]', error)
    return Response.json({ error: toErrorMessage(error) }, { status: 500 })
  }
}
