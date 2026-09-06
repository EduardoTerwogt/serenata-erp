import { requireSection } from '@/lib/api-auth'
import { getDocumentosByProyecto, createDocumento } from '@/lib/db'
import { ProyectoDocumentoCreateSchema, validate } from '@/lib/validation/schemas'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const documentos = await getDocumentosByProyecto(id)
    return Response.json(documentos)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Error obteniendo documentos del proyecto' }, { status: 500 })
  }
}

// Alta manual de un documento -- uso principal: un nuevo Status Report
// (repetible). Para los tipos singleton, si ya existe uno, se informa en
// vez de duplicar (el índice único de la tabla lo rechazaría igual).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('proyectos')
  if (authResult.response) return authResult.response

  try {
    const { id } = await params
    const body = await request.json()
    const validation = validate(ProyectoDocumentoCreateSchema, body)
    if (!validation.ok) {
      return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    const documento = await createDocumento(id, validation.data)
    return Response.json(documento, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('duplicate key') || message.includes('idx_proyecto_documentos_unico')) {
      return Response.json(
        { error: 'Ya existe un documento de este tipo para el proyecto (no es repetible)' },
        { status: 409 }
      )
    }
    console.error(error)
    return Response.json({ error: 'Error creando documento' }, { status: 500 })
  }
}
