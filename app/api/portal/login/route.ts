import { verifyPassword } from '@/lib/auth-utils'
import { validate, PortalLoginSchema } from '@/lib/validation/schemas'
import { getProveedorByCorreo } from '@/lib/db'
import { setPortalSessionCookie } from '@/lib/portal-auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = validate(PortalLoginSchema, body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    const { correo, password } = parsed.data

    const proveedor = await getProveedorByCorreo(correo)
    if (!proveedor || proveedor.portal_estado === null) {
      return Response.json({ error: 'Correo o contraseña incorrectos' }, { status: 401 })
    }

    const valido = await verifyPassword(password, proveedor.password_hash as string)
    if (!valido) {
      return Response.json({ error: 'Correo o contraseña incorrectos' }, { status: 401 })
    }

    await setPortalSessionCookie(proveedor.id)

    return Response.json({
      success: true,
      requiere_confirmacion: proveedor.portal_estado === 'pendiente_confirmacion',
    })
  } catch (error) {
    console.error('[portal/login]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
