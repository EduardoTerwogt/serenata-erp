import { describe, expect, it } from 'vitest'
import { PdfTemplateSchema } from '@/lib/server/pdf/pdf-template-schema'

/**
 * Integración de los 5 tracks paralelos de Bloques 2-3 (docs/PLAN.md
 * "Dependencias reales entre bloques"): PdfTemplateSchema (Track A) debe
 * bloquear un token de color (Track B) o una {{variable}} (Track C)
 * inexistentes, sin que Track A haya importado A/B/C entre sí.
 */

const BASE_PAGE = { width: 210 as const, height: 297 as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } }

function textTemplate(colorToken: string, text: string) {
  return {
    tipoDocumento: 'cotizacion' as const,
    page: BASE_PAGE,
    elements: [
      {
        id: 'el-1',
        x: 10,
        y: 10,
        w: 50,
        type: 'text' as const,
        text,
        size: 10,
        bold: false,
        align: 'left' as const,
        colorToken,
      },
    ],
  }
}

describe('pdf-template-schema (integración A+B+C)', () => {
  it('acepta un token de color y una variable reales', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('orange', 'Cliente: {{cliente}}'))
    expect(result.success).toBe(true)
  })

  it('rechaza un token de color inexistente', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('no-existe', 'Cliente: {{cliente}}'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Token de color inválido'))).toBe(true)
    }
  })

  it('rechaza una variable inexistente para el tipo de documento', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('orange', 'Cliente: {{no_existe_esto}}'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(i => i.message.includes('Variable inexistente'))).toBe(true)
    }
  })

  it('rechaza una variable válida para otro documento pero no para cotizacion', () => {
    const result = PdfTemplateSchema.safeParse(textTemplate('orange', 'Banco: {{responsables[].responsable.banco}}'))
    expect(result.success).toBe(false)
  })
})

describe('pdf-template-schema: visibleIf (Bloque 7)', () => {
  it('acepta visibleIf con un path real del tipo de documento', () => {
    const template = {
      tipoDocumento: 'cotizacion' as const,
      page: BASE_PAGE,
      elements: [
        {
          id: 'notas',
          x: 10,
          y: 10,
          w: 50,
          type: 'text' as const,
          text: 'Notas: {{notas}}',
          size: 10,
          bold: false,
          align: 'left' as const,
          colorToken: 'orange',
          visibleIf: 'notas',
        },
      ],
    }
    expect(PdfTemplateSchema.safeParse(template).success).toBe(true)
  })

  it('rechaza visibleIf con un path inexistente', () => {
    const template = {
      tipoDocumento: 'cotizacion' as const,
      page: BASE_PAGE,
      elements: [
        {
          id: 'notas',
          x: 10,
          y: 10,
          w: 50,
          type: 'text' as const,
          text: 'Notas',
          size: 10,
          bold: false,
          align: 'left' as const,
          colorToken: 'orange',
          visibleIf: 'campo_inventado',
        },
      ],
    }
    const result = PdfTemplateSchema.safeParse(template)
    expect(result.success).toBe(false)
  })
})

describe('pdf-template-schema: totals-banner (Bloque 7, piloto Cotización)', () => {
  function bannerTemplate(overrides: Partial<{ bgColorToken: string; rowColorToken: string; valueVariable: string; visibleIf: string }> = {}) {
    return {
      tipoDocumento: 'cotizacion' as const,
      page: BASE_PAGE,
      elements: [
        {
          id: 'banner',
          x: 10,
          y: 10,
          w: 180,
          h: 28,
          type: 'totals-banner' as const,
          bgColorToken: overrides.bgColorToken ?? 'ink',
          rows: [
            {
              label: 'Subtotal',
              valueVariable: overrides.valueVariable ?? 'subtotal',
              labelColorToken: overrides.rowColorToken ?? 'ink',
              valueColorToken: overrides.rowColorToken ?? 'ink',
              bold: false,
              fontSize: 9.5,
              visibleIf: overrides.visibleIf,
            },
          ],
        },
      ],
    }
  }

  it('acepta un banner con colores y valueVariable reales', () => {
    expect(PdfTemplateSchema.safeParse(bannerTemplate()).success).toBe(true)
  })

  it('rechaza bgColorToken inválido', () => {
    const result = PdfTemplateSchema.safeParse(bannerTemplate({ bgColorToken: 'no-existe' }))
    expect(result.success).toBe(false)
  })

  it('rechaza el color de una fila inválido', () => {
    const result = PdfTemplateSchema.safeParse(bannerTemplate({ rowColorToken: 'no-existe' }))
    expect(result.success).toBe(false)
  })

  it('rechaza valueVariable inexistente en el catálogo', () => {
    const result = PdfTemplateSchema.safeParse(bannerTemplate({ valueVariable: 'campo_inventado' }))
    expect(result.success).toBe(false)
  })

  it('rechaza visibleIf de fila inexistente en el catálogo', () => {
    const result = PdfTemplateSchema.safeParse(bannerTemplate({ visibleIf: 'campo_inventado' }))
    expect(result.success).toBe(false)
  })

  it('acepta visibleIf de fila con la variable booleana real (iva_activo)', () => {
    const result = PdfTemplateSchema.safeParse(bannerTemplate({ visibleIf: 'iva_activo' }))
    expect(result.success).toBe(true)
  })
})
