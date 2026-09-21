import { describe, expect, it } from 'vitest'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'
import { buildHojaLlamadoBaseline } from '@/lib/server/pdf/default-templates/hoja-llamado'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { buildSampleData } from '@/lib/server/pdf/pdf-sample-data'

/** Bloque 8 (docs/PLAN.md): mismo pipeline único preview/aplicar que Cotización. */
describe('default-templates/hoja-llamado (Bloque 8, baseline real)', () => {
  it('pasa PdfTemplateSchema sin errores', () => {
    const result = PdfTemplateSchema.safeParse(buildHojaLlamadoBaseline())
    expect(result.success).toBe(true)
  })

  it('renderiza un PDF válido con datos de muestra, sin excepción', () => {
    const template = buildHojaLlamadoBaseline()
    const doc = createSpikeDoc(template.page)
    const data = buildSampleData('hoja_llamado') as Record<string, unknown>

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('renderiza en una sola página con datos reales típicos (crew + equipo)', () => {
    const template = buildHojaLlamadoBaseline()
    const doc = createSpikeDoc(template.page)
    const data = {
      proyecto: 'Proyecto Ejemplo',
      cliente: 'Cliente de Prueba SA de CV',
      fecha_entrega: '2026-09-21',
      locacion: 'CDMX',
      horarios: '08:00 - 18:00',
      punto_encuentro: 'Estudio Serenata',
      notas: 'Traer chaleco de seguridad.',
      crew_items: [
        { responsable_nombre: 'Ana López', descripcion: 'Directora de fotografía', telefono: '555-1111', notas: '' },
      ],
      equipo_items: [{ descripcion: 'Cámara RED', cantidad: 1, responsable_nombre: 'Ana López', notas: '' }],
      fecha_generacion: '21 de septiembre 2026',
    }

    renderFromTemplate(doc, template, data, resolveColorToken)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('sin notas, sin crew ni equipo: usa emptyText y no revienta', () => {
    const template = buildHojaLlamadoBaseline()
    const doc = createSpikeDoc(template.page)
    const data = {
      proyecto: 'Proyecto',
      cliente: 'Cliente',
      fecha_entrega: '2026-09-21',
      locacion: '',
      horarios: '',
      punto_encuentro: '',
      notas: '',
      crew_items: [],
      equipo_items: [],
      fecha_generacion: '21 de septiembre 2026',
    }

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
  })
})
