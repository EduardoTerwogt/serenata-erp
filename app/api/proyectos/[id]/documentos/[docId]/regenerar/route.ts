import { requireSection } from '@/lib/api-auth'
import { getDocumentoById, updateDocumentoAutoGenerado } from '@/lib/db'
import { DocumentoSinAutollenadoError, reconstruirContenidoDocumento } from '@/lib/server/projects/documentos-autofill'
import { ProyectoDocumentoRegenerarSchema, validate } from '@/lib/validation/schemas'

export async function POST(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id, docId } = await params
    const body = await request.json().catch(() => ({}))
    const validation = validate(ProyectoDocumentoRegenerarSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const documento = await getDocumentoById(docId)
    if (documento.proyecto_id !== id) {
      return Response.json({ error: 'El documento no pertenece a este proyecto' }, { status: 404 })
    }

    if (documento.editado_manualmente && !validation.data.force) {
      return Response.json(
        { error: 'Este documento ya fue editado a mano. Envía { "force": true } para sobrescribirlo.' },
        { status: 409 }
      )
    }

    const contenido = await reconstruirContenidoDocumento(id, documento.tipo)
    const actualizado = await updateDocumentoAutoGenerado(docId, contenido)
    return Response.json(actualizado)
  } catch (error) {
    if (error instanceof DocumentoSinAutollenadoError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    console.error(error)
    return Response.json({ error: 'Error regenerando documento' }, { status: 500 })
  }
}
