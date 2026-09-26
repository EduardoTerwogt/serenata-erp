import { requireSection } from '@/lib/api-auth'
import { getDocumentosCuentaPagar, updateDocumentoCuentaPagar, validarFacturaProveedor } from '@/lib/db'
import { DocumentoEstadoValidacionSchema, validate } from '@/lib/validation/schemas'
import { buildErrorResponse } from '@/lib/server/errors/domain-error'

// Marca manualmente el estado_validacion de un documento (cualquier tipo:
// FACTURA_PROVEEDOR, FACTURA_PROVEEDOR_XML, COMPROBANTE_PAGO, OTRO).
// La validación automática estructural (solo FACTURA_PROVEEDOR_XML) vive en
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

    const documentos = await getDocumentosCuentaPagar(id)
    const documento = documentos.find(d => d.id === docId)
    if (!documento) {
      return Response.json({ error: 'Documento no encontrado en esta cuenta' }, { status: 404 })
    }

    const { estado_validacion, detalle_validacion } = validation.data

    // V3 (Rediseño de Cuentas B2): una factura XML de proveedor SOLO pasa a
    // 'validado' vía validar_factura_proveedor, que en la misma transacción
    // guarda el snapshot del total a transferir.
    if (documento.tipo === 'FACTURA_PROVEEDOR_XML' && estado_validacion === 'validado') {
      await validarFacturaProveedor(docId, authResult.session?.user?.email ?? null)
      return Response.json({ documento: { ...documento, estado_validacion: 'validado', detalle_validacion: null } })
    }

    const actualizado = await updateDocumentoCuentaPagar(docId, {
      estado_validacion,
      detalle_validacion: estado_validacion === 'revision' ? (detalle_validacion ?? null) : null,
    })

    return Response.json({ documento: actualizado })
  } catch (error) {
    return buildErrorResponse(error, 'PATCH /api/cuentas-pagar/documentos/:docId')
  }
}
