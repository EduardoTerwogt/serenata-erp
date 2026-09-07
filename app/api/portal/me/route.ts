import { requirePortalSession } from '@/lib/portal-auth'
import { getProveedorById } from '@/lib/db'
import { Proveedor } from '@/lib/types'
import { toErrorMessage } from '@/lib/server/portal/error-message'

export async function GET() {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const proveedor = (await getProveedorById(portalAuth.proveedorId)) as Proveedor
    if (!proveedor || proveedor.portal_estado === null) {
      return Response.json({ error: 'No autenticado' }, { status: 401 })
    }

    let candidato: { id: string; nombre: string } | null = null
    if (proveedor.portal_estado === 'pendiente_confirmacion' && proveedor.match_candidato_id) {
      const candidatoProveedor = await getProveedorById(proveedor.match_candidato_id).catch(() => null)
      if (candidatoProveedor) candidato = { id: candidatoProveedor.id, nombre: candidatoProveedor.nombre }
    }

    return Response.json({
      id: proveedor.id,
      nombre: proveedor.nombre,
      correo: proveedor.correo,
      portal_estado: proveedor.portal_estado,
      candidato,
    })
  } catch (error) {
    console.error('[portal/me]', error)
    return Response.json({ error: toErrorMessage(error) }, { status: 500 })
  }
}
