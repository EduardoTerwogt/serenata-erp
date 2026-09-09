import { requirePortalSession, setPortalSessionCookie } from '@/lib/portal-auth'
import { validate, PortalConfirmarMatchSchema } from '@/lib/validation/schemas'
import { confirmarMatch, updateProveedor } from '@/lib/db'
import { toErrorMessage } from '@/lib/server/portal/error-message'

export async function POST(request: Request) {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const body = await request.json()
    const parsed = validate(PortalConfirmarMatchSchema, body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    const { confirmar } = parsed.data

    if (confirmar) {
      const proveedorFinal = await confirmarMatch(portalAuth.proveedorId)
      // La fila original del signup se borró en la fusión -- la sesión debe
      // re-firmarse apuntando al proveedor sobreviviente (el candidato).
      await setPortalSessionCookie(proveedorFinal.id, proveedorFinal.session_version)
      return Response.json({ success: true, proveedor: proveedorFinal })
    }

    const proveedorActualizado = await updateProveedor(portalAuth.proveedorId, {
      portal_estado: 'activo',
      match_candidato_id: null,
    })
    return Response.json({ success: true, proveedor: proveedorActualizado })
  } catch (error) {
    console.error('[portal/signup/confirmar]', error)
    return Response.json({ error: toErrorMessage(error) }, { status: 500 })
  }
}
