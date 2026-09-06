import { requireSection } from '@/lib/api-auth'
import { getDocumentoById, updateDocumentoManual, deleteDocumento } from '@/lib/db'
import { ProyectoDocumentoUpdateSchema, validate } from '@/lib/validation/schemas'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { docId } = await params
    const documento = await getDocumentoById(docId)
    return Response.json(documento)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Documento no encontrado' }, { status: 404 })
  }
}

// Cualquier edición aquí se marca editado_manualmente=true -- "regenerar"
// (que sí puede pisar una edición manual) vive en el endpoint aparte.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { docId } = await params
    const body = await request.json()
    const validation = validate(ProyectoDocumentoUpdateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const documento = await updateDocumentoManual(docId, validation.data)
    return Response.json(documento)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error actualizando documento' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { docId } = await params
    await deleteDocumento(docId)
    return Response.json({ success: true })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error eliminando documento' }, { status: 500 })
  }
}
