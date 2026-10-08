import { requireSection } from '@/lib/api-auth'
import { getGoogleEnv } from '@/lib/integrations/google/env'
import { reintentarSubida } from '@/lib/server/cuentas/archivos-pendientes'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'
import { resolveUploadFolderId } from '@/lib/server/loadtest/drive-folder-override'
import { ReintentarSubidaSchema, validate } from '@/lib/validation/schemas'

const ROUTE = 'POST /api/cuentas/documentos/[id]/reintentar-subida'

/**
 * #131: sube a Drive el archivo de un documento que quedó pendiente (la factura se guardó pero Drive falló). Multipart:
 * `archivo` y `lado` (`cobro` | `proveedor`). El documento no cambia salvo su enlace; si ya estaba en Drive no hace nada.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const formData = await request.formData()
    const validation = validate(ReintentarSubidaSchema, { id, lado: formData.get('lado') })
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 })
    const archivo = formData.get('archivo')
    if (!(archivo instanceof File) || archivo.size === 0) return Response.json({ error: 'Se requiere el archivo' }, { status: 400 })
    const googleEnv = getGoogleEnv()
    if (!googleEnv) return Response.json({ error: 'Google Drive no configurado' }, { status: 500 })

    const { status, body } = await reintentarSubida({
      lado: validation.data.lado,
      id: validation.data.id,
      archivo,
      folderId: resolveUploadFolderId(request, googleEnv.driveFolderIdCuentas || undefined),
      route: ROUTE,
    })
    return Response.json(body, { status })
  } catch (error) {
    return buildErrorResponse(error, ROUTE)
  }
}
