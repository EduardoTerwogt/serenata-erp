export const maxDuration = 60

import { requireSection } from '@/lib/api-auth'
import { getCotizacionById } from '@/lib/db'
import { generateCotizacionPdf, type CotizacionPDFData } from '@/lib/server/pdf/cotizacion-pdf'
import { buildCotizacionTemplateData } from '@/lib/server/pdf/cotizacion-template-data'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import { PdfPlantillasRepository } from '@/lib/server/repositories/pdf-plantillas'

/**
 * Editor de PDFs (docs/PLAN.md, Roadmap → P0-A): si Cotización ya está
 * migrada al diseñador visual (fila en `pdf_plantillas` con
 * `active_schema`), el PDF real se genera con ese template vía
 * `renderFromTemplate()` -- ya no con `cotizacion-pdf.ts` hardcodeado. Se
 * re-valida con Zod antes de renderizar (mismo pipeline que preview/aplicar,
 * "Seguridad del schema" en docs/PLAN.md) en vez de confiar ciegamente en lo
 * ya guardado -- es la misma clase de corrupción que ya se encontró una vez
 * en este campo (`20260922_fix_cotizacion_active_schema_flow_layout.sql`).
 * Un schema inválido para un documento migrado falla explícito (nunca
 * silencioso) en vez de caer de vuelta al generador viejo -- eso escondería
 * la corrupción y serviría un PDF que ya no es el diseño "aplicado".
 */
function renderCotizacionFromTemplate(activeSchema: unknown, pdfData: CotizacionPDFData): ArrayBuffer {
  const validation = PdfTemplateSchema.safeParse(activeSchema)
  if (!validation.success) {
    console.error('[cotizaciones/generar-pdf] active_schema inválido:', validation.error.issues)
    throw new Error('La plantilla activa de Cotización tiene un schema inválido')
  }

  const template = validation.data
  const doc = createSpikeDoc(template.page)
  renderFromTemplate(doc, template, buildCotizacionTemplateData(pdfData), resolveColorToken)
  return doc.output('arraybuffer') as ArrayBuffer
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const authResult = await requireSection('cotizaciones')
  if (authResult.response) return authResult.response

  try {
    const { id } = await props.params
    const inline = new URL(request.url).searchParams.get('mode') === 'inline'

    // Fetch cotización data
    const cotizacion = await getCotizacionById(id)
    if (!cotizacion) {
      return new Response('Cotización no encontrada', { status: 404 })
    }

    // Transform cotización data to PDF format
    const pdfData: CotizacionPDFData = {
      id: cotizacion.id,
      cliente: cotizacion.cliente,
      proyecto: cotizacion.proyecto,
      fecha_entrega: cotizacion.fecha_entrega,
      locacion: cotizacion.locacion || null,
      fecha_cotizacion: cotizacion.fecha_cotizacion || null,
      items: (cotizacion.items || []).map((item) => ({
        categoria: item.categoria,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        importe: item.importe,
      })),
      subtotal: cotizacion.subtotal,
      fee_agencia: cotizacion.fee_agencia || 0,
      general: cotizacion.general,
      iva: cotizacion.iva || 0,
      total: cotizacion.total,
      iva_activo: cotizacion.iva_activo || false,
      porcentaje_fee: cotizacion.porcentaje_fee || 0,
      descuento_tipo: (cotizacion.descuento_tipo as 'monto' | 'porcentaje') || 'monto',
      descuento_valor: cotizacion.descuento_valor || 0,
      notas: cotizacion.notas_pdf || null,
    }

    // Generate PDF -- template migrado (P0-A) tiene prioridad sobre el
    // generador hardcodeado; sin fila en pdf_plantillas, comportamiento sin
    // cambios (documento aún no migrado).
    const plantillaRow = await PdfPlantillasRepository.getByTipo('cotizacion')
    const pdfBuffer = plantillaRow
      ? renderCotizacionFromTemplate(plantillaRow.active_schema, pdfData)
      : generateCotizacionPdf(pdfData)

    // Return PDF response
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="Cotizacion_${cotizacion.id}.pdf"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('[cotizaciones/generar-pdf]', error)
    return new Response('Error al generar PDF', { status: 500 })
  }
}
