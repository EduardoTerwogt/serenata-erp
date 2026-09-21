import { describe, expect, it } from 'vitest'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'
import { buildReporteCierreBaseline } from '@/lib/server/pdf/default-templates/reporte-cierre'
import { createSpikeDoc, renderFromTemplate } from '@/lib/server/pdf/template-renderer'
import { resolveColorToken } from '@/lib/server/pdf/pdf-color-tokens'
import { buildSampleData } from '@/lib/server/pdf/pdf-sample-data'

/** Bloque 8 (docs/PLAN.md): mismo pipeline único preview/aplicar que Cotización. */
describe('default-templates/reporte-cierre (Bloque 8, baseline real)', () => {
  it('pasa PdfTemplateSchema sin errores', () => {
    const result = PdfTemplateSchema.safeParse(buildReporteCierreBaseline())
    expect(result.success).toBe(true)
  })

  it('renderiza un PDF válido con datos de muestra, sin excepción', () => {
    const template = buildReporteCierreBaseline()
    const doc = createSpikeDoc(template.page)
    const data = buildSampleData('reporte_cierre') as Record<string, unknown>

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
    const bytes = Buffer.from(doc.output('arraybuffer'))
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('renderiza en una sola página con datos reales típicos (hitos + equipo)', () => {
    const template = buildReporteCierreBaseline()
    const doc = createSpikeDoc(template.page)
    const financiero = { total_cotizado: 120000, total_cobrado: 100000, total_pagado: 80000 }
    const data = {
      proyecto: 'Proyecto Ejemplo',
      cliente: 'Cliente de Prueba SA de CV',
      fecha_cierre: '2026-09-20',
      financiero_fila: [financiero],
      hitos: [{ titulo: 'Preproducción', planeado: '2026-08-01', real: '2026-08-02' }],
      equipo_texto: 'Ana López (DF, Cámara), Beto Ruiz',
      incidencias_texto: 'Retraso de 1 día por lluvia en locación.',
    }

    renderFromTemplate(doc, template, data, resolveColorToken)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('sin hitos: usa emptyText y no revienta', () => {
    const template = buildReporteCierreBaseline()
    const doc = createSpikeDoc(template.page)
    const data = {
      proyecto: 'Proyecto',
      cliente: 'Cliente',
      fecha_cierre: '2026-09-20',
      financiero_fila: [{ total_cotizado: 0, total_cobrado: 0, total_pagado: 0 }],
      hitos: [],
      equipo_texto: 'Sin equipo registrado.',
      incidencias_texto: 'Sin incidencias registradas.',
    }

    expect(() => renderFromTemplate(doc, template, data, resolveColorToken)).not.toThrow()
  })
})
