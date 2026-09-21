import { requireSection } from '@/lib/api-auth'
import { PdfPlantillasRepository } from '@/lib/server/repositories/pdf-plantillas'
import { PdfDocumentTypeSchema, PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Aplicar diseño: `active_schema = draft_schema` actual, `draft_schema =
 * null`. Bloqueado si el schema tiene errores estructurales (docs/PLAN.md,
 * "Diseño activo vs. borrador") -- re-valida contra el mismo
 * PdfTemplateSchema que el autosave, no confía en lo ya guardado.
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
    const row = await PdfPlantillasRepository.getByTipo(tipoResult.data)
    if (!row) {
      return Response.json({ error: 'Documento aún no migrado al editor' }, { status: 404 })
    }
    if (!row.draft_schema) {
      return Response.json({ error: 'No hay cambios sin aplicar' }, { status: 400 })
    }

    const validation = PdfTemplateSchema.safeParse(row.draft_schema)
    if (!validation.success) {
      return Response.json(
        {
          error: 'El diseño tiene errores y no se puede aplicar',
          details: validation.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      )
    }

    const updated = await PdfPlantillasRepository.aplicar(tipoResult.data, validation.data, userId)
    return Response.json(updated)
  } catch (error) {
    console.error('[editor-pdfs] POST aplicar error:', error)
    return Response.json({ error: 'Error aplicando el diseño' }, { status: 500 })
  }
}
