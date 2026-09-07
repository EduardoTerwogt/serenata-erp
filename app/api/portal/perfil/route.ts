import { requirePortalSession } from '@/lib/portal-auth'
import { getProveedorById, updateProveedor } from '@/lib/db'
import { validate, PortalPerfilSchema } from '@/lib/validation/schemas'

export async function GET() {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const proveedor = await getProveedorById(portalAuth.proveedorId)
    return Response.json({
      nombre: proveedor.nombre,
      telefono: proveedor.telefono,
      banco: proveedor.banco,
      clabe: proveedor.clabe,
      regimen_fiscal: proveedor.regimen_fiscal,
    })
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
    const parsed = validate(PortalPerfilSchema, body)
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })

    const proveedor = await updateProveedor(portalAuth.proveedorId, parsed.data)
    return Response.json({
      nombre: proveedor.nombre,
      telefono: proveedor.telefono,
      banco: proveedor.banco,
      clabe: proveedor.clabe,
      regimen_fiscal: proveedor.regimen_fiscal,
    })
  } catch (error) {
    console.error('[portal/perfil]', error)
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
