import { requirePortalSession } from '@/lib/portal-auth'
import { getProveedorById, updateProveedor } from '@/lib/db'
import { validate, PortalPerfilBancarioSchema } from '@/lib/validation/schemas'

export async function GET() {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const proveedor = await getProveedorById(portalAuth.proveedorId)
    return Response.json({ banco: proveedor.banco, clabe: proveedor.clabe })
  } catch (error) {
    console.error('[portal/perfil]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const body = await request.json()
    const parsed = validate(PortalPerfilBancarioSchema, body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

    const proveedor = await updateProveedor(portalAuth.proveedorId, parsed.data)
    return Response.json({ banco: proveedor.banco, clabe: proveedor.clabe })
  } catch (error) {
    console.error('[portal/perfil]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
