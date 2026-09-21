import { describe, expect, it } from 'vitest'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'
import { buildCotizacionBaseline } from '@/lib/server/pdf/default-templates/cotizacion'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { buildSampleData } from '@/lib/server/pdf/pdf-sample-data'

/**
 * Bloque 7 (docs/PLAN.md, piloto Cotización): el baseline reconstruido debe
 * pasar por el mismo pipeline único preview/aplicar (`PdfTemplateSchema` +
 * `renderFromTemplate`) que cualquier plantilla editada a mano -- si el
 * baseline no valida o no renderiza, "Restaurar plantilla" y la primera
 * migración quedan rotas para todos los usuarios.
 */
describe('default-templates/cotizacion (Bloque 7, baseline real)', () => {
  it('pasa PdfTemplateSchema sin errores', () => {
    const result = PdfTemplateSchema.safeParse(buildCotizacionBaseline())
    expect(result.success).toBe(true)
  })

  it('renderiza un PDF válido con datos de muestra, sin excepción', () => {
    const template = buildCotizacionBaseline()
    const doc = createSpikeDoc(template.page)
    const data = buildSampleData('cotizacion') as Record<string, unknown>

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('renderiza en una sola página con datos reales típicos (pocos ítems, sin desborde)', () => {
    const template = buildCotizacionBaseline()
    const doc = createSpikeDoc(template.page)
    const data = {
      id: 'SH2402',
      cliente: 'Cliente de Prueba SA de CV',
      proyecto: 'Proyecto Ejemplo',
      fecha_entrega: '2026-09-21',
      locacion: 'CDMX',
      fecha_cotizacion: '2026-09-15',
      items: [
        { categoria: 'Equipo', descripcion: 'Grúa importada', cantidad: 1, precio_unitario: 4000, importe: 4000 },
        { categoria: 'Equipo', descripcion: 'Dolly importado', cantidad: 1, precio_unitario: 2500, importe: 2500 },
        { categoria: 'Personal', descripcion: 'Operador', cantidad: 2, precio_unitario: 1500, importe: 3000 },
      ],
      subtotal: 9500,
      fee_agencia: 950,
      general: 10450,
      iva: 1672,
      total: 12622,
      iva_activo: true,
      porcentaje_fee: 10,
      descuento_monto: 250,
      notas: 'Incluye transporte de equipo a locación foránea.',
    }

    renderFromTemplate(doc, template, data, resolveColorToken)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('sin descuento, sin IVA activo y sin notas: no revienta y esconde esas filas/bloques', () => {
    const template = buildCotizacionBaseline()
    const doc = createSpikeDoc(template.page)
    const data = {
      id: 'SH2403',
      cliente: 'Cliente',
      proyecto: 'Proyecto',
      fecha_entrega: '2026-09-21',
      locacion: '',
      fecha_cotizacion: '2026-09-15',
      items: [{ categoria: 'Equipo', descripcion: 'Cámara', cantidad: 1, precio_unitario: 1000, importe: 1000 }],
      subtotal: 1000,
      fee_agencia: 100,
      general: 1100,
      iva: 0,
      total: 1100,
      iva_activo: false,
      porcentaje_fee: 10,
      descuento_monto: 0,
      notas: '',
    }

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
  })
})
