import { describe, expect, it } from 'vitest'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'
import { buildOrdenPagoBaseline } from '@/lib/server/pdf/default-templates/orden-pago'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { buildSampleData } from '@/lib/server/pdf/pdf-sample-data'

/** Bloque 9 (docs/PLAN.md): rediseño con `repeating-group` (responsable ->
 * evento), no una reconstrucción 1:1 del generador viejo -- ver docstring
 * de orden-pago.ts. */
describe('default-templates/orden-pago (Bloque 9, rediseño con repeating-group)', () => {
  it('pasa PdfTemplateSchema sin errores', () => {
    const result = PdfTemplateSchema.safeParse(buildOrdenPagoBaseline())
    expect(result.success).toBe(true)
  })

  it('renderiza un PDF válido con datos de muestra (nesteado responsables/eventos/items), sin excepción', () => {
    const template = buildOrdenPagoBaseline()
    const doc = createSpikeDoc(template.page)
    const data = buildSampleData('orden_pago') as Record<string, unknown>

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('renderiza en una sola página con 2 responsables, 2 eventos c/u y varios ítems', () => {
    const template = buildOrdenPagoBaseline()
    const doc = createSpikeDoc(template.page)
    const data = {
      fecha_generacion: '22 de septiembre 2026',
      responsables: [
        {
          responsable: {
            nombre: 'Ana López',
            correo: 'ana@serenata.mx',
            telefono: '555-1111',
            banco: 'BBVA',
            clabe: '012180000000000001',
            contacto_texto: 'Correo: ana@serenata.mx · Tel: 555-1111 · Banco: BBVA · CLABE: 012180000000000001',
          },
          total_responsable: 12500,
          eventos: [
            {
              cotizacion_folio: 'SH2402',
              proyecto: 'Proyecto Alpha',
              subtotal: 7000,
              items: [
                { descripcion: 'Renta de grúa', cantidad: 1, monto: 4000 },
                { descripcion: 'Operador', cantidad: 2, monto: 3000 },
              ],
            },
            {
              cotizacion_folio: 'SH2410',
              proyecto: 'Proyecto Beta',
              subtotal: 5500,
              items: [{ descripcion: 'Dirección de fotografía', cantidad: 1, monto: 5500 }],
            },
          ],
        },
        {
          responsable: {
            nombre: 'Beto Ruiz',
            correo: 'beto@serenata.mx',
            telefono: '555-2222',
            banco: '',
            clabe: '',
            contacto_texto: 'Correo: beto@serenata.mx · Tel: 555-2222',
          },
          total_responsable: 2800,
          eventos: [
            {
              cotizacion_folio: 'SH2402',
              proyecto: 'Proyecto Alpha',
              subtotal: 2800,
              items: [{ descripcion: 'Sonido en locación', cantidad: 1, monto: 2800 }],
            },
          ],
        },
      ],
      resumen: { responsables: 2, eventos: 3, items_totales: 4, total_general: 15300 },
    }

    renderFromTemplate(doc, template, data, resolveColorToken)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('sin responsables: no revienta (0 filas en el grupo repetido)', () => {
    const template = buildOrdenPagoBaseline()
    const doc = createSpikeDoc(template.page)
    const data = {
      fecha_generacion: '22 de septiembre 2026',
      responsables: [],
      resumen: { responsables: 0, eventos: 0, items_totales: 0, total_general: 0 },
    }

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
  })

  it('muchos responsables fuerza multipágina sin excepción', () => {
    const template = buildOrdenPagoBaseline()
    const doc = createSpikeDoc(template.page)
    const responsables = Array.from({ length: 10 }, (_, i) => ({
      responsable: {
        nombre: `Responsable ${i + 1}`,
        correo: `r${i + 1}@serenata.mx`,
        telefono: '555-0000',
        banco: 'BBVA',
        clabe: '0121800000000000',
        contacto_texto: `Correo: r${i + 1}@serenata.mx · Tel: 555-0000`,
      },
      total_responsable: 1000 * (i + 1),
      eventos: [
        {
          cotizacion_folio: `SH240${i}`,
          proyecto: `Proyecto ${i + 1}`,
          subtotal: 1000 * (i + 1),
          items: [{ descripcion: 'Ítem único', cantidad: 1, monto: 1000 * (i + 1) }],
        },
      ],
    }))
    const data = {
      fecha_generacion: '22 de septiembre 2026',
      responsables,
      resumen: { responsables: 10, eventos: 10, items_totales: 10, total_general: 55000 },
    }

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
})
