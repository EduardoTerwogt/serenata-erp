import { requireSection } from '@/lib/api-auth'
import { PdfPlantillasRepository } from '@/lib/server/repositories/pdf-plantillas'
import { PdfDocumentTypeSchema } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Migrar: crea la primera fila de `pdf_plantillas` para un documento que
 * todavía está en el generador hardcodeado viejo, copiando el baseline de
 * código (docs/PLAN.md, Bloques 7-9). Distinto de `restaurar`, que requiere
 * una fila ya existente (`UPDATE ... WHERE tipo_documento`) -- responde 501
 * si el documento no tiene baseline todavía (mismo patrón que `restaurar`).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const authResult = await requireSection('editor-pdfs')
  if (authResult.response) return authResult.response

  const { tipo } = await params
  const tipoResult = PdfDocumentTypeSchema.safeParse(tipo)
  if (!tipoResult.success) {
    return Response.json({ error: 'Tipo de documento inválido' }, { status: 400 })
  }

  const userId = (authResult.session?.user as { id?: string })?.id
  if (!userId) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const row = await PdfPlantillasRepository.migrar(tipoResult.data, userId)
    return Response.json(row)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error migrando el documento'
    console.error('[editor-pdfs] POST migrar error:', error)
    return Response.json({ error: message }, { status: 501 })
  }
}
