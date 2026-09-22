import { describe, expect, it } from 'vitest'
import { PdfElementSchema, type PdfElement, type PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'

/**
 * Bloque 10 (docs/PLAN.md "Editor de PDFs"): prueba de que el motor
 * genérico (`PdfElement`/`renderFromTemplate`) generaliza más allá de los 4
 * documentos reales, SIN dar de alta un 5º documento de producción real
 * (decisión del usuario en sesión 2026-09-22: prueba técnica, no
 * producción) -- no toca `PdfDocumentTypeSchema`, `pdf_plantillas`, el
 * catálogo de variables por documento (`pdf-template-variables.ts`) ni el
 * catálogo/UI del editor (`app/editor-pdfs/`). No aparece en el sidebar, no
 * es usable por nadie -- vive solo como este test.
 *
 * "Recibo de anticipo" es un documento SINTÉTICO, con nombres de campo que
 * no existen en ningún catálogo real, pensado para combinar todo el
 * vocabulario acumulado en los Bloques 7-9 de una forma que NINGUNO de los
 * 4 documentos reales ejercita:
 * - `repeating-group` de UN solo nivel (los 4 documentos reales, cuando lo
 *   usan -- solo Orden de pago -- lo anidan a 2 niveles; acá se prueba que
 *   también funciona standalone, sin anidar).
 * - `totals-banner` con una fila condicional (`visibleIf`) en un documento
 *   que no es Cotización.
 * - `TableElement.emptyText` en un documento que no es Hoja de
 *   llamado/Reporte de cierre.
 * - `format:'currency'`/`format:'date'` combinados en el mismo texto y en
 *   columnas de tabla.
 * - `align:'justify'` para un párrafo legal, fuera de Cotización.
 *
 * Como `tipoDocumento` no puede ser un valor fuera del enum real (a
 * propósito -- ver arriba), este test NO llama `PdfTemplateSchema.parse()`
 * sobre el template completo (esa validación incluye el catálogo de
 * variables por documento, que es infraestructura deliberadamente atada a
 * los 4 tipos reales). En cambio, valida cada `PdfElement` individual con
 * `PdfElementSchema` (genérico, no depende de `tipoDocumento`) y ejercita
 * el renderer real (`renderFromTemplate`), que tampoco lee `tipoDocumento`
 * -- solo `page`/`elements`.
 */
describe('Bloque 10: el motor genérico soporta un documento nuevo, no solo los 4 reales', () => {
  const MARGIN = 12
  const CONTENT_W = 210 - 2 * MARGIN

  function buildReciboAnticipoElements(): PdfElement[] {
    return [
      {
        id: 'titulo',
        type: 'text',
        x: MARGIN,
        y: 20,
        w: 140,
        text: 'RECIBO DE ANTICIPO',
        size: 16,
        bold: true,
        align: 'left',
        colorToken: 'ink',
        required: true,
        zIndex: 1,
      },
      {
        id: 'fecha',
        type: 'text',
        x: MARGIN,
        y: 20,
        w: CONTENT_W,
        text: 'Emitido: {{fecha_emision}}',
        size: 9,
        bold: false,
        align: 'left',
        colorToken: 'ink-muted',
        format: 'date',
        flowAfter: 'titulo',
        gap: 4,
        zIndex: 2,
      },
      {
        id: 'conceptos-group',
        type: 'repeating-group',
        x: MARGIN,
        y: 40,
        w: CONTENT_W,
        rowsBinding: 'conceptos',
        itemGap: 9,
        itemHeight: 30,
        flowAfter: 'fecha',
        gap: 6,
        required: true,
        zIndex: 3,
        children: [
          {
            id: 'concepto-nombre',
            type: 'text',
            x: MARGIN,
            y: 40,
            w: CONTENT_W,
            h: 6,
            text: '{{nombre_concepto}}',
            size: 9,
            bold: true,
            align: 'left',
            colorToken: 'ink',
            bgToken: 'surface-alt',
            zIndex: 1,
          },
          {
            id: 'concepto-desglose',
            type: 'table',
            x: MARGIN,
            y: 40,
            w: CONTENT_W,
            cols: [
              { label: 'Partida', field: 'partida', align: 'left', w: CONTENT_W - 60, visible: true },
              { label: 'Monto', field: 'monto_partida', align: 'right', w: 60, visible: true, format: 'currency' },
            ],
            rowsBinding: 'desglose',
            emptyText: 'Sin desglose para este concepto.',
            bordered: true,
            lightHead: false,
            zebra: false,
            headerColorToken: 'ink',
            flowAfter: 'concepto-nombre',
            gap: 1.5,
            zIndex: 2,
          },
          {
            id: 'concepto-total',
            type: 'text',
            x: MARGIN,
            y: 40,
            w: CONTENT_W,
            h: 6,
            text: 'ANTICIPO DE ESTE CONCEPTO: {{monto_anticipo}}',
            size: 8.5,
            bold: true,
            align: 'right',
            colorToken: 'orange-strong',
            bgToken: 'surface-alt-2',
            format: 'currency',
            flowAfter: 'concepto-desglose',
            gap: 1.5 + 6,
            zIndex: 3,
          },
        ],
      },
      {
        id: 'resumen-banner',
        type: 'totals-banner',
        x: MARGIN,
        y: 200,
        w: CONTENT_W,
        bgColorToken: 'ink',
        flowAfter: 'conceptos-group',
        gap: 6,
        zIndex: 4,
        rows: [
          {
            label: 'Total de conceptos',
            valueVariable: 'total_conceptos',
            labelColorToken: 'ink-faint',
            valueColorToken: 'surface',
            bold: false,
            fontSize: 9.5,
          },
          {
            label: 'Retención aplicada',
            valueVariable: 'retencion',
            labelColorToken: 'yellow',
            valueColorToken: 'yellow',
            bold: false,
            fontSize: 9.5,
            negate: true,
            visibleIf: 'retencion',
          },
          {
            label: 'TOTAL ANTICIPO',
            valueVariable: 'total_anticipo',
            labelColorToken: 'surface',
            valueColorToken: 'surface',
            bold: true,
            fontSize: 11,
          },
        ],
      },
      {
        id: 'legal',
        type: 'text',
        x: MARGIN,
        y: 200,
        w: CONTENT_W,
        text: 'Este anticipo se aplicará contra la facturación final del proyecto y no es reembolsable una vez iniciados los trabajos correspondientes a los conceptos aquí listados.',
        size: 8,
        bold: false,
        align: 'justify',
        colorToken: 'ink',
        legal: true,
        flowAfter: 'resumen-banner',
        gap: 8,
        zIndex: 5,
      },
    ]
  }

  it('cada elemento pasa PdfElementSchema (genérico, no atado a un tipo de documento real)', () => {
    for (const el of buildReciboAnticipoElements()) {
      const result = PdfElementSchema.safeParse(el)
      expect(result.success, JSON.stringify(result.success ? null : result.error.issues)).toBe(true)
    }
  })

  it('renderFromTemplate (el motor real, no un mock) renderiza el documento nuevo sin excepción', () => {
    const template: Pick<PdfTemplate, 'page' | 'elements'> = {
      page: { width: 210, height: 297, margins: { top: 10, right: MARGIN, bottom: 15, left: MARGIN } },
      elements: buildReciboAnticipoElements(),
    }
    const doc = createSpikeDoc(template.page)
    const data = {
      fecha_emision: '2026-09-22',
      conceptos: [
        {
          nombre_concepto: 'Preproducción',
          monto_anticipo: 5000,
          desglose: [
            { partida: 'Scouting de locación', monto_partida: 2000 },
            { partida: 'Casting', monto_partida: 3000 },
          ],
        },
        {
          nombre_concepto: 'Equipo técnico',
          monto_anticipo: 8000,
          desglose: [],
        },
      ],
      total_conceptos: 13000,
      retencion: 1300,
      total_anticipo: 11700,
    }

    expect(() =>
      renderFromTemplate(doc, template as PdfTemplate, data, resolveColorToken)
    ).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('sin retención (visibleIf oculta esa fila) y sin desglose en ningún concepto: no revienta', () => {
    const template: Pick<PdfTemplate, 'page' | 'elements'> = {
      page: { width: 210, height: 297, margins: { top: 10, right: MARGIN, bottom: 15, left: MARGIN } },
      elements: buildReciboAnticipoElements(),
    }
    const doc = createSpikeDoc(template.page)
    const data = {
      fecha_emision: '2026-09-22',
      conceptos: [{ nombre_concepto: 'Preproducción', monto_anticipo: 5000, desglose: [] }],
      total_conceptos: 5000,
      retencion: 0,
      total_anticipo: 5000,
    }

    expect(() =>
      renderFromTemplate(doc, template as PdfTemplate, data, resolveColorToken)
    ).not.toThrow()
  })
})
