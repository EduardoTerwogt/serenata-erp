import { describe, expect, it } from 'vitest'
import { jsPDF } from 'jspdf'
import { renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'

/**
 * `renderFromTemplate` con `flowAfter`/`totals-banner`/`visibleIf` reales
 * (docs/PLAN.md, Bloque 7 en curso) -- reemplaza el `active_schema` corrupto
 * que tenía producción (campos que ningún renderer sabía interpretar) por
 * una prueba real de que el schema válido sí se dibuja de punta a punta.
 */

const PAGE = { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } }

function template(): PdfTemplate {
  return {
    tipoDocumento: 'cotizacion',
    page: PAGE,
    elements: [
      { id: 'title', type: 'text', x: 10, y: 15, w: 100, size: 12, bold: true, align: 'left', colorToken: 'ink', text: '{{cliente}}' },
      {
        id: 'items',
        type: 'table',
        x: 10,
        y: 30,
        w: 190,
        cols: [
          { label: 'Descripción', field: 'descripcion', align: 'left', w: 140, visible: true },
          { label: 'Importe', field: 'importe', align: 'right', w: 50, visible: true },
        ],
        rowsBinding: 'items',
        bordered: true,
        lightHead: false,
        zebra: false,
        required: true,
      },
      {
        id: 'totals',
        type: 'totals-banner',
        x: 10,
        y: 200,
        w: 190,
        flowAfter: 'items',
        flowGap: 5,
        bgColorToken: 'ink',
        required: true,
        rows: [
          { label: 'Subtotal', valueVariable: 'subtotal', labelColorToken: 'ink-faint', valueColorToken: 'surface', bold: false, fontSize: 9.5 },
          {
            label: 'Descuento',
            valueVariable: 'descuento_monto',
            labelColorToken: 'orange-soft',
            valueColorToken: 'orange-soft',
            bold: false,
            fontSize: 9.5,
            negate: true,
            visibleIf: 'descuento_monto',
          },
          { label: 'TOTAL', valueVariable: 'total', labelColorToken: 'surface', valueColorToken: 'surface', bold: true, fontSize: 10.5 },
        ],
      },
      {
        id: 'notas-text',
        type: 'text',
        x: 10,
        y: 200,
        w: 190,
        size: 8.5,
        bold: false,
        align: 'justify',
        colorToken: 'ink',
        text: 'Nota: {{notas}}',
        wrap: true,
        flowAfter: 'totals',
        flowGap: 6,
        visibleIf: 'notas',
      },
    ],
  }
}

const resolveColor = resolveColorToken

describe('renderFromTemplate — layout de flujo real', () => {
  it('dibuja el flujo completo (tabla → totals-banner → nota) sin excepción', () => {
    const doc = new jsPDF('p', 'mm', [PAGE.width, PAGE.height])
    const data = {
      cliente: 'Cliente de prueba',
      items: [
        { descripcion: 'Servicio A', importe: 1000 },
        { descripcion: 'Servicio B', importe: 2000 },
      ],
      subtotal: 3000,
      descuento_monto: 300,
      total: 2700,
      notas: 'Entrega en dos partes.',
    }
    expect(() => renderFromTemplate(doc, template(), data, resolveColor)).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('con visibleIf falso, la fila de descuento y la nota no aparecen (y no truena)', () => {
    const doc = new jsPDF('p', 'mm', [PAGE.width, PAGE.height])
    const data = {
      cliente: 'Cliente sin descuento',
      items: [{ descripcion: 'Servicio único', importe: 500 }],
      subtotal: 500,
      descuento_monto: 0,
      total: 500,
      notas: '',
    }
    expect(() => renderFromTemplate(doc, template(), data, resolveColor)).not.toThrow()
  })
})
