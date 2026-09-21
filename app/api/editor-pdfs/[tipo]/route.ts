import { requireSection } from '@/lib/api-auth'
import { PdfPlantillasRepository } from '@/lib/server/repositories/pdf-plantillas'
import { PdfDocumentTypeSchema } from '@/lib/server/pdf/pdf-template-schema'

export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const authResult = await requireSection('editor-pdfs')
  if (authResult.response) return authResult.response

  const { tipo } = await params
  const tipoResult = PdfDocumentTypeSchema.safeParse(tipo)
  if (!tipoResult.success) {
    return Response.json({ error: 'Tipo de documento inválido' }, { status: 400 })
  }

  try {
    const row = await PdfPlantillasRepository.getByTipo(tipoResult.data)
    // Sin fila = el documento sigue en el generador hardcodeado viejo
    // (docs/PLAN.md, "Diseño activo vs. borrador") -- no es un error.
    return Response.json(row)
  } catch (error) {
    console.error('[editor-pdfs] GET error:', error)
    return Response.json({ error: 'Error obteniendo la plantilla' }, { status: 500 })
  }
}
