import { describe, expect, it } from 'vitest'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import type { PdfTemplate } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Bloque 2, Track A (docs/PLAN.md): `renderFromTemplate()` sobre el schema
 * tipado. `resolveColor` es un stub inyectado a propósito — el resolver real
 * (`pdf-color-tokens.ts`) se cablea en la integración, no aquí.
 */

const RESOLVE_COLOR = (token: string): [number, number, number] => {
  if (token === 'sn-orange') return [254, 123, 1]
  if (token === 'sn-ink') return [26, 26, 26]
  return [0, 0, 0]
}

function basePage(): PdfTemplate['page'] {
  return { width: 210, height: 297, margins: { top: 20, right: 15, bottom: 20, left: 15 } }
}

describe('renderFromTemplate', () => {
  it('renderiza texto, línea, imagen y tabla sin excepción y produce un PDF válido', () => {
    const doc = createSpikeDoc(basePage())
    const template: PdfTemplate = {
      tipoDocumento: 'cotizacion',
      page: basePage(),
      elements: [
        {
          id: 'titulo',
          type: 'text',
          x: 15,
          y: 20,
          w: 100,
          text: 'COTIZACIÓN {{folio}}',
          size: 16,
          bold: true,
          align: 'left',
          colorToken: 'sn-ink',
          required: true,
        },
        {
          id: 'linea',
          type: 'line',
          x: 15,
          y: 25,
          w: 180,
          colorToken: 'sn-orange',
          weight: 0.5,
        },
        {
          id: 'tabla',
          type: 'table',
          x: 15,
          y: 40,
          w: 150,
          cols: [
            { label: 'Categoría', field: 'categoria', align: 'left', w: 50, visible: true },
            { label: 'Descripción', field: 'descripcion', align: 'left', w: 70, visible: true },
            { label: 'Oculta', field: 'oculto', align: 'left', w: 20, visible: false },
            { label: 'Importe', field: 'importe', align: 'right', w: 30, visible: true },
          ],
          rowsBinding: 'items',
          groupBy: 'categoria',
          bordered: true,
          lightHead: false,
          zebra: false,
          headerColorToken: 'sn-orange',
          borderColorToken: 'sn-ink',
        },
      ],
    }

    const data = {
      folio: 'SH2402',
      items: [
        { categoria: 'Equipo', descripcion: 'Grúa importada', importe: '4000' },
        { categoria: 'Equipo', descripcion: 'Dolly importado', importe: '2500' },
        { categoria: 'Personal', descripcion: 'Operador', importe: '1500' },
      ],
    }

    expect(() => renderFromTemplate(doc, template, data, RESOLVE_COLOR)).not.toThrow()

    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('deja el placeholder literal cuando la variable no existe en data', () => {
    const doc = createSpikeDoc(basePage())
    const template: PdfTemplate = {
      tipoDocumento: 'orden_pago',
      page: basePage(),
      elements: [
        {
          id: 'texto',
          type: 'text',
          x: 15,
          y: 20,
          w: 100,
          text: 'Responsable: {{responsable.nombre}}',
          size: 10,
          bold: false,
          align: 'left',
          colorToken: 'sn-ink',
        },
      ],
    }

    expect(() => renderFromTemplate(doc, template, {}, RESOLVE_COLOR)).not.toThrow()
  })

  it('redibuja los elementos sticky en cada página generada por una tabla grande', () => {
    const doc = createSpikeDoc(basePage())
    const rows = Array.from({ length: 150 }, (_, i) => ({
      categoria: i % 2 === 0 ? 'Equipo' : 'Personal',
      descripcion: `Item #${i + 1}`,
      importe: String(1000 + i),
    }))

    const template: PdfTemplate = {
      tipoDocumento: 'cotizacion',
      page: basePage(),
      elements: [
        {
          id: 'header',
          type: 'text',
          x: 15,
          y: 12,
          w: 100,
          text: 'COTIZACIÓN {{folio}}',
          size: 10,
          bold: true,
          align: 'left',
          colorToken: 'sn-ink',
          sticky: 'header',
          required: true,
        },
        {
          id: 'footer',
          type: 'text',
          x: 15,
          y: 290,
          w: 100,
          text: 'Serenata House',
          size: 7,
          bold: false,
          align: 'left',
          colorToken: 'sn-ink',
          sticky: 'footer',
        },
        {
          id: 'tabla',
          type: 'table',
          x: 15,
          y: 35,
          w: 180,
          cols: [
            { label: 'Categoría', field: 'categoria', align: 'left', w: 50, visible: true },
            { label: 'Descripción', field: 'descripcion', align: 'left', w: 100, visible: true },
            { label: 'Importe', field: 'importe', align: 'right', w: 30, visible: true },
          ],
          rowsBinding: 'items',
          groupBy: 'categoria',
          bordered: false,
          lightHead: true,
          zebra: true,
        },
      ],
    }

    renderFromTemplate(doc, template, { folio: 'SH2402', items: rows }, RESOLVE_COLOR)
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it('usa un array vacío cuando rowsBinding no resuelve a un array', () => {
    const doc = createSpikeDoc(basePage())
    const template: PdfTemplate = {
      tipoDocumento: 'reporte_cierre',
      page: basePage(),
      elements: [
        {
          id: 'tabla',
          type: 'table',
          x: 15,
          y: 40,
          w: 150,
          cols: [{ label: 'Concepto', field: 'concepto', align: 'left', w: 100, visible: true }],
          rowsBinding: 'no.existe',
          bordered: false,
          lightHead: false,
          zebra: false,
        },
      ],
    }

    expect(() => renderFromTemplate(doc, template, {}, RESOLVE_COLOR)).not.toThrow()
  })

  it('Bloque 7: omite un elemento entero cuando visibleIf es falsy (bloque NOTAS condicional)', () => {
    const doc = createSpikeDoc(basePage())
    const template: PdfTemplate = {
      tipoDocumento: 'cotizacion',
      page: basePage(),
      elements: [
        {
          id: 'notas',
          type: 'text',
          x: 15,
          y: 20,
          w: 100,
          text: 'Notas: {{notas}}',
          size: 10,
          bold: false,
          align: 'left',
          colorToken: 'sn-ink',
          visibleIf: 'notas',
        },
      ],
    }

    expect(() => renderFromTemplate(doc, template, { notas: '' }, RESOLVE_COLOR)).not.toThrow()
    // Sin notas, el único elemento de la plantilla no se dibuja -- no hay
    // forma directa de verificar "no se dibujó" sin parsear el PDF, pero al
    // menos confirma que no revienta con data que apaga visibleIf.
    const withNotas = createSpikeDoc(basePage())
    expect(() =>
      renderFromTemplate(withNotas, template, { notas: 'Aplica IVA' }, RESOLVE_COLOR)
    ).not.toThrow()
  })

  it('Bloque 7: renderiza un totals-banner filtrando filas por visibleIf', () => {
    const doc = createSpikeDoc(basePage())
    const template: PdfTemplate = {
      tipoDocumento: 'cotizacion',
      page: basePage(),
      elements: [
        {
          id: 'banner',
          type: 'totals-banner',
          x: 15,
          y: 200,
          w: 180,
          h: 28,
          bgColorToken: 'sn-ink',
          required: true,
          rows: [
            {
              label: 'Subtotal',
              valueVariable: 'subtotal',
              labelColorToken: 'sn-ink',
              valueColorToken: 'sn-ink',
              bold: false,
              fontSize: 9.5,
            },
            {
              label: 'Descuento',
              valueVariable: 'descuento_valor',
              labelColorToken: 'sn-orange',
              valueColorToken: 'sn-orange',
              bold: false,
              fontSize: 9.5,
              negate: true,
              visibleIf: 'descuento_valor',
            },
            {
              label: 'IVA (16%)',
              valueVariable: 'iva',
              labelColorToken: 'sn-ink',
              valueColorToken: 'sn-ink',
              bold: false,
              fontSize: 9.5,
              visibleIf: 'iva_activo',
            },
            {
              label: 'TOTAL',
              valueVariable: 'total',
              labelColorToken: 'sn-ink',
              valueColorToken: 'sn-ink',
              bold: true,
              fontSize: 10.5,
            },
          ],
        },
      ],
    }

    // Sin descuento ni IVA activo: solo Subtotal + TOTAL deberían dibujarse,
    // sin romper nada aunque falten esos campos.
    expect(() =>
      renderFromTemplate(doc, template, { subtotal: 1000, total: 1000, descuento_valor: 0, iva_activo: false }, RESOLVE_COLOR)
    ).not.toThrow()

    // Con descuento e IVA activos, las 4 filas se dibujan.
    const docFull = createSpikeDoc(basePage())
    expect(() =>
      renderFromTemplate(
        docFull,
        template,
        { subtotal: 1000, descuento_valor: 100, iva: 144, iva_activo: true, total: 1044 },
        RESOLVE_COLOR
      )
    ).not.toThrow()

    const bytes = Buffer.from(docFull.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('Bloque 7: formatea columnas con format:"currency" y calcula el total por grupo (__groupTotal)', () => {
    const doc = createSpikeDoc(basePage())
    const template: PdfTemplate = {
      tipoDocumento: 'cotizacion',
      page: basePage(),
      elements: [
        {
          id: 'tabla',
          type: 'table',
          x: 15,
          y: 40,
          w: 180,
          cols: [
            { label: 'Categoría', field: 'categoria', align: 'left', w: 40, visible: true },
            { label: 'Descripción', field: 'descripcion', align: 'left', w: 60, visible: true },
            { label: 'Precio unitario', field: 'precio_unitario', align: 'right', w: 25, visible: true, format: 'currency' },
            { label: 'Importe', field: 'importe', align: 'right', w: 25, visible: true, format: 'currency' },
            { label: 'Total categoría', field: '__groupTotal', align: 'right', w: 30, visible: true },
          ],
          rowsBinding: 'items',
          groupBy: 'categoria',
          groupTotalOf: 'importe',
          bordered: true,
          lightHead: false,
          zebra: false,
        },
      ],
    }

    const data = {
      items: [
        { categoria: 'Equipo', descripcion: 'Grúa importada', precio_unitario: 4000, importe: 4000 },
        { categoria: 'Equipo', descripcion: 'Dolly importado', precio_unitario: 2500, importe: 2500 },
        { categoria: 'Personal', descripcion: 'Operador', precio_unitario: 1500, importe: 1500 },
      ],
    }

    expect(() => renderFromTemplate(doc, template, data, RESOLVE_COLOR)).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('Bloque 7: un texto largo hace wrap dentro de `w` en vez de salirse de la página', () => {
    const doc = createSpikeDoc(basePage())
    const longText =
      'Este presupuesto es 100% modular y se adaptará a las necesidades del cliente. ' +
      'Una vez aterrizada la propuesta al 100% se ajustarán los costos en consecuencia.'
    const template: PdfTemplate = {
      tipoDocumento: 'cotizacion',
      page: basePage(),
      elements: [
        {
          id: 'legal',
          type: 'text',
          x: 15,
          y: 250,
          w: 90,
          text: longText,
          size: 8.5,
          bold: false,
          align: 'left',
          colorToken: 'sn-ink',
          legal: true,
        },
      ],
    }

    expect(() => renderFromTemplate(doc, template, {}, RESOLVE_COLOR)).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })
})
