import { requireSection } from '@/lib/api-auth'
import { getProveedorDocumentos, updateProveedorDocumento } from '@/lib/db'
import { DocumentoEstadoValidacionSchema, validate } from '@/lib/validation/schemas'

// Punto 2 (2026-09-20), mitad "híbrido" que le toca a staff: la
// auto-clasificación de POST /api/portal/documentos hace su mejor esfuerzo
// con IA, pero staff siempre puede corregirla a mano -- mismo patrón que
// app/api/cuentas-pagar/grupos/[id]/documentos/[docId]/route.ts, sin el
// paso de "cerrar el grupo" (ese es específico de cuentas, no aplica acá).
export async function PATCH(request: Request, props: { params: Promise<{ id: string; docId: string }> }) {
  const authResult = await requireSection('responsables')
  if (authResult.response) return authResult.response

  try {
    const { id, docId } = await props.params
    const body = await request.json()

    const validation = validate(DocumentoEstadoValidacionSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const documentos = await getProveedorDocumentos(id)
    const documento = documentos.find(d => d.id === docId)
    if (!documento) {
      return Response.json({ error: 'Documento no encontrado para este proveedor' }, { status: 404 })
    }

    const { estado_validacion, detalle_validacion } = validation.data
    const actualizado = await updateProveedorDocumento(docId, {
      estado_validacion,
      detalle_validacion: estado_validacion === 'revision' ? (detalle_validacion ?? null) : null,
    })

    return Response.json({ documento: actualizado })
  } catch (error) {
    console.error('[proveedores/documentos/:docId][PATCH]', error)
    return Response.json({ error: 'Error actualizando estado de validación' }, { status: 500 })
  }
}
