import { requireSection } from '@/lib/api-auth'
import { PdfPlantillasRepository } from '@/lib/server/repositories/pdf-plantillas'
import { PdfDocumentTypeSchema, PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'
import { validate } from '@/lib/validation/schemas'

/** Autosave del editor. Nunca toca `active_schema`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const authResult = await requireSection('editor-pdfs')
  if (authResult.response) return authResult.response

  const { tipo } = await params
  const tipoResult = PdfDocumentTypeSchema.safeParse(tipo)
  if (!tipoResult.success) {
    return Response.json({ error: 'Tipo de documento inválido' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Mismo pipeline único de validación que "Aplicar diseño" y la vista
  // previa (docs/PLAN.md, "Seguridad del schema y pipeline único
  // preview/aplicar") -- un schema que el autosave acepta nunca es
  // rechazado después por Aplicar diseño.
  const validation = validate(PdfTemplateSchema, body)
  if (!validation.ok) {
    return Response.json({ error: validation.error, details: validation.details }, { status: 400 })
  }

  if (validation.data.tipoDocumento !== tipoResult.data) {
    return Response.json({ error: 'tipoDocumento del schema no coincide con la URL' }, { status: 400 })
  }

  const userId = (authResult.session?.user as { id?: string })?.id
  if (!userId) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const row = await PdfPlantillasRepository.saveDraft(tipoResult.data, validation.data, userId)
    return Response.json(row)
  } catch (error) {
    console.error('[editor-pdfs] PATCH draft error:', error)
    return Response.json({ error: 'Error guardando el borrador' }, { status: 500 })
  }
}

/** Descartar cambios: vuelve al diseño actualmente aplicado. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const authResult = await requireSection('editor-pdfs')
  if (authResult.response) return authResult.response

  const { tipo } = await params
  const tipoResult = PdfDocumentTypeSchema.safeParse(tipo)
  if (!tipoResult.success) {
    return Response.json({ error: 'Tipo de documento inválido' }, { status: 400 })
  }

  try {
    const row = await PdfPlantillasRepository.discardDraft(tipoResult.data)
    return Response.json(row)
  } catch (error) {
    console.error('[editor-pdfs] DELETE draft error:', error)
    return Response.json({ error: 'Error descartando cambios' }, { status: 500 })
  }
}
