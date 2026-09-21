import { requireSection } from '@/lib/api-auth'
import { PdfPlantillasRepository } from '@/lib/server/repositories/pdf-plantillas'
import { PdfDocumentTypeSchema, PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'
import { buildSampleData } from '@/lib/server/pdf/pdf-sample-data'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'

/**
 * Vista previa del editor (Bloque 6, docs/PLAN.md): mismo pipeline que
 * "Aplicar diseño" (Zod antes de renderizar, nunca un atajo) y el mismo
 * renderer que el PDF final (`renderFromTemplate`), reusando el patrón
 * `Content-Disposition: inline` de
 * `app/api/cotizaciones/[id]/generar-pdf/route.ts`. El editor edita la
 * PLANTILLA, no un documento real concreto, así que interpola contra
 * datos de ejemplo (`buildSampleData`), no contra un registro real.
 */
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
    if (!row) {
      return Response.json({ error: 'Documento aún no migrado al editor' }, { status: 404 })
    }

    const validation = PdfTemplateSchema.safeParse(row.draft_schema ?? row.active_schema)
    if (!validation.success) {
      return Response.json(
        {
          error: 'La plantilla tiene errores y no se puede previsualizar',
          details: validation.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      )
    }

    const template = validation.data
    const doc = createSpikeDoc(template.page)
    const sampleData = buildSampleData(tipoResult.data)
    renderFromTemplate(doc, template, sampleData, resolveColorToken)

    const pdfBuffer = doc.output('arraybuffer')
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-${tipoResult.data}.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('[editor-pdfs] GET preview error:', error)
    return Response.json({ error: 'Error generando la vista previa' }, { status: 500 })
  }
}
