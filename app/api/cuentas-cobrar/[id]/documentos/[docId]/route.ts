import { requireSection } from '@/lib/api-auth'
import { getDocumentosCuentaCobrar, updateDocumentoCuentaCobrar } from '@/lib/db'
import { DocumentoEstadoValidacionSchema, validate } from '@/lib/validation/schemas'

// Marca manualmente el estado_validacion de un documento (cualquier tipo:
// FACTURA_PDF, FACTURA_XML, COMPLEMENTO_PAGO, COMPLEMENTO_PAGO_PDF, OTRO).
// La validación automática estructural (solo FACTURA_XML) vive en
// subir-factura/route.ts; esto es la corrección manual sobre ese resultado,
// o la clasificación de documentos que no se validan automáticamente.
export async function PATCH(request: Request, props: { params: Promise<{ id: string; docId: string }> }) {
  const authResult = await requireSection('cuentas')
  if (authResult.response) return authResult.response

  try {
    const { id, docId } = await props.params
    const body = await request.json()

    const validation = validate(DocumentoEstadoValidacionSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const documentos = await getDocumentosCuentaCobrar(id)
    const documento = documentos.find(d => d.id === docId)
    if (!documento) {
      return Response.json({ error: 'Documento no encontrado en esta cuenta' }, { status: 404 })
    }

    const { estado_validacion, detalle_validacion } = validation.data
    const actualizado = await updateDocumentoCuentaCobrar(docId, {
      estado_validacion,
      detalle_validacion: estado_validacion === 'revision' ? (detalle_validacion ?? null) : null,
    })

    return Response.json({ documento: actualizado })
  } catch (error) {
    console.error('[cuentas-cobrar/documentos/:docId][PATCH]', error)
    return Response.json({ error: 'Error actualizando estado de validación' }, { status: 500 })
  }
}
