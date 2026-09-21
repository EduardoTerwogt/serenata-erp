import { requireSection } from '@/lib/api-auth'
import { PdfPlantillasRepository } from '@/lib/server/repositories/pdf-plantillas'
import { PdfDocumentTypeSchema } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Restaurar plantilla: pide confirmación en el cliente (puede perder una
 * customización) -- acá solo se ejecuta. `draft_schema = null` y
 * `active_schema` = copia concreta del baseline de código en ese momento
 * (docs/PLAN.md, "Diseño activo vs. borrador"). El baseline por documento
 * se agrega en los Bloques 7-9 -- hasta entonces esta ruta responde 501.
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
    const row = await PdfPlantillasRepository.restaurar(tipoResult.data, userId)
    return Response.json(row)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error restaurando la plantilla'
    console.error('[editor-pdfs] POST restaurar error:', error)
    return Response.json({ error: message }, { status: 501 })
  }
}
