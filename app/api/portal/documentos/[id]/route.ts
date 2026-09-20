import { requirePortalSession } from '@/lib/portal-auth'
import { getProveedorDocumentoById, deleteProveedorDocumento } from '@/lib/db'
import { extractDriveFileId, deleteDriveFile } from '@/lib/integrations/google/drive'
import { DomainError, buildErrorResponse } from '@/lib/server/errors/domain-error'

const ROUTE_DELETE = 'DELETE /api/portal/documentos/:id'

// Punto 3 (2026-09-20): el proveedor podía "Subir otro" documento pero
// nunca borrar uno ya subido. Un documento ya `validado` no se puede
// borrar por acá -- es un registro de cumplimiento que staff ya aceptó;
// si de verdad hay que reemplazarlo, es un caso para Serenata, no un botón
// de un clic. `pendiente`/`revision` sí se pueden borrar libremente (el
// proveedor se equivocó de archivo o quiere volver a intentar).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const portalAuth = await requirePortalSession()
  if (portalAuth.response) return portalAuth.response

  try {
    const { id } = await params
    const documento = await getProveedorDocumentoById(id)
    if (!documento) {
      throw new DomainError({ code: 'documento_no_encontrado', status: 404, safeMessage: 'Documento no encontrado' })
    }
    if (documento.proveedor_id !== portalAuth.proveedorId) {
      throw new DomainError({ code: 'documento_ajeno', status: 404, safeMessage: 'Documento no encontrado' })
    }
    if (documento.estado_validacion === 'validado') {
      throw new DomainError({
        code: 'documento_validado_no_se_borra',
        status: 409,
        safeMessage: 'Este documento ya fue validado -- contacta a Serenata si necesitas reemplazarlo',
      })
    }

    // Borrado del archivo en Drive best-effort: la URL guardada nunca
    // divergió del patrón `.../file/d/{fileId}/...` que arma
    // uploadFileToDrive, pero si algún día lo hace (o Drive falla) el
    // registro en la base sigue siendo la fuente de verdad para el
    // proveedor -- no dejar un archivo huérfano en Drive nunca debe
    // bloquear que el documento desaparezca de su lista.
    const fileId = extractDriveFileId(documento.archivo_url)
    if (fileId) {
      try {
        await deleteDriveFile(fileId)
      } catch (err) {
        console.error('[portal/documentos/:id][DELETE] No se pudo borrar el archivo de Drive (se borra igual el registro):', err)
      }
    }

    await deleteProveedorDocumento(id)
    return Response.json({ success: true })
  } catch (error) {
    return buildErrorResponse(error, ROUTE_DELETE)
  }
}
