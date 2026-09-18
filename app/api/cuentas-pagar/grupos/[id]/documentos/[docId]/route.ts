import { requireSection } from '@/lib/api-auth'
import { getDocumentosCuentaPagarGrupo, updateDocumentoCuentaPagar, marcarGrupoFacturado } from '@/lib/db'
import { DocumentoEstadoValidacionSchema, validate } from '@/lib/validation/schemas'

// Contraparte agrupada de app/api/cuentas-pagar/[id]/documentos/[docId]/route.ts
// (mecanismo ya existente de resolución manual de un documento en
// estado_validacion='revision'). Mismo comportamiento, más un paso: si la
// corrección deja el documento en 'validado' y el grupo todavía está
// ABIERTO, cierra el grupo (pasa a FACTURADO) -- sin esto, un grupo con una
// factura en revisión sin resolver se quedaría ABIERTO para siempre
// (docs/PLAN.md, Bloque 3).
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

    const documentos = await getDocumentosCuentaPagarGrupo(id)
    const documento = documentos.find(d => d.id === docId)
    if (!documento) {
      return Response.json({ error: 'Documento no encontrado en este grupo' }, { status: 404 })
    }

    const { estado_validacion, detalle_validacion } = validation.data
    const actualizado = await updateDocumentoCuentaPagar(docId, {
      estado_validacion,
      detalle_validacion: estado_validacion === 'revision' ? (detalle_validacion ?? null) : null,
    })

    if (estado_validacion === 'validado') {
      await marcarGrupoFacturado(id)
    }

    return Response.json({ documento: actualizado })
  } catch (error) {
    console.error('[cuentas-pagar/grupos/documentos/:docId][PATCH]', error)
    return Response.json({ error: 'Error actualizando estado de validación' }, { status: 500 })
  }
}
